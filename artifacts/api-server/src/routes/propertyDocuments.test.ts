import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, count, eq } from "drizzle-orm";
import sharp from "sharp";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  db,
  propertiesTable,
  propertyDocumentsTable,
  propertyDocumentUploadGrantsTable,
  propertyDocumentUploadIntentsTable,
  usersTable,
  type User,
} from "@workspace/db";

const authState = vi.hoisted(() => ({
  user: null as User | null,
}));
const storageState = vi.hoisted(() => ({
  objects: new Map<string, { bytes: Buffer; contentType: string }>(),
  failWrite: false,
  sizeOverride: null as number | null,
  overwriteOnPin: false,
}));

vi.mock("../lib/auth", () => ({
  resolveUser: vi.fn(async () => authState.user),
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }

  class ObjectStorageService {
    async getPrivateObjectFileForKey(
      key: string,
      _requireExists = true,
      pinnedGeneration?: string | number,
    ) {
      const object = storageState.objects.get(key);
      if (!object) throw new ObjectNotFoundError();
      const generation = storageState.overwriteOnPin && pinnedGeneration !== undefined && key.includes("/staging/")
        ? "2"
        : "1";
      return {
        async getMetadata() {
          return [
            {
              size: String(storageState.sizeOverride ?? object.bytes.length),
              contentType: object.contentType,
              generation,
            },
          ];
        },
        async download() {
          return [object.bytes];
        },
        createReadStream() {
          return Readable.from(object.bytes);
        },
      };
    }

    async writePrivateObject(
      key: string,
      bytes: Buffer,
      contentType: string,
    ) {
      if (storageState.failWrite) throw new Error("storage write failed");
      storageState.objects.set(key, { bytes, contentType });
      return this.getPrivateObjectFileForKey(key);
    }

    async writePrivateObjectStream(
      key: string,
      source: AsyncIterable<Buffer>,
      maxBytes: number,
      contentType: string,
    ) {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of source) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) throw new Error("object too large");
        chunks.push(bytes);
      }
      storageState.objects.set(key, { bytes: Buffer.concat(chunks), contentType });
      return total;
    }

    async deletePrivateObject(key: string) {
      storageState.objects.delete(key);
    }
  }

  return { ObjectNotFoundError, ObjectStorageService };
});

const suffix = `${process.pid}-${Date.now()}`;
const adminId = `property-doc-test-admin-${suffix}`;
const employeeAId = `property-doc-test-employee-a-${suffix}`;
const employeeBId = `property-doc-test-employee-b-${suffix}`;
let propertyId = 0;
let router: express.Router;
let storageRouter: express.Router;

function user(
  id: string,
  role: "admin" | "employee",
  emailPrefix: string,
): typeof usersTable.$inferInsert {
  return {
    id,
    email: `${emailPrefix}-${suffix}@example.test`,
    name: emailPrefix,
    role,
    status: "active",
    approvalStatus: "approved",
  };
}

function appWith(routes: express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = {
      error: () => undefined,
      warn: () => undefined,
    };
    next();
  });
  app.use(routes);
  return app;
}

function setUser(user: User | null) {
  authState.user = user;
}

async function request(
  app: express.Express,
  path: string,
  init: RequestInit = {},
) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } finally {
    server.close();
  }
}

async function grant(userId: string) {
  setUser((await db.select().from(usersTable).where(eq(usersTable.id, adminId)))[0] ?? null);
  return request(appWith(router), `/admin/property-documents/upload-grants/${userId}`, {
    method: "POST",
    body: "{}",
  });
}

async function revoke(userId: string) {
  setUser((await db.select().from(usersTable).where(eq(usersTable.id, adminId)))[0] ?? null);
  return request(appWith(router), `/admin/property-documents/upload-grants/${userId}`, {
    method: "DELETE",
  });
}

async function createIntent(
  employee: User,
  contentType = "application/pdf",
  originalBytes = 100,
) {
  setUser(employee);
  return request(appWith(router), "/employee/property-documents/upload-intents", {
    method: "POST",
    body: JSON.stringify({
      propertyId,
      originalName: "test-document.pdf",
      originalBytes,
      contentType,
    }),
  });
}

async function setStage(intentId: string, bytes: Buffer, contentType: string) {
  const [intent] = await db
    .select()
    .from(propertyDocumentUploadIntentsTable)
    .where(eq(propertyDocumentUploadIntentsTable.id, intentId));
  if (!intent) throw new Error("Intent fixture not found");
  storageState.objects.set(intent.stageKey, { bytes, contentType });
  return intent;
}

async function validPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 180]);
  return Buffer.from(await pdf.save());
}

beforeAll(async () => {
  const [admin, employeeA, employeeB] = await db
    .insert(usersTable)
    .values([
      user(adminId, "admin", "property-document-admin"),
      user(employeeAId, "employee", "property-document-employee-a"),
      user(employeeBId, "employee", "property-document-employee-b"),
    ])
    .returning();
  const [property] = await db
    .insert(propertiesTable)
    .values({
      name: `Property document fixture ${suffix}`,
      category: "budget",
      country: "India",
      state: "Test State",
      city: "Test City",
      area: "Test Area",
      pincode: "000000",
      address: "1 Test Street",
      description: "Property document fixture",
      imageUrl: "https://example.test/property.jpg",
      images: [],
      amenities: [],
      policies: [],
      startingPrice: 100,
      status: "active",
    })
    .returning();
  propertyId = property!.id;
  router = (await import("./propertyDocuments")).default;
  storageRouter = (await import("./storage")).default;
  setUser(admin!);
});

afterAll(async () => {
  await db
    .delete(propertyDocumentUploadIntentsTable)
    .where(eq(propertyDocumentUploadIntentsTable.propertyId, propertyId));
  await db.delete(propertyDocumentsTable).where(eq(propertyDocumentsTable.propertyId, propertyId));
  await db
    .delete(propertyDocumentUploadGrantsTable)
    .where(eq(propertyDocumentUploadGrantsTable.userId, employeeAId));
  await db
    .delete(propertyDocumentUploadGrantsTable)
    .where(eq(propertyDocumentUploadGrantsTable.userId, employeeBId));
  await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
  await db.delete(usersTable).where(
    and(
      eq(usersTable.id, adminId),
      eq(usersTable.email, `property-document-admin-${suffix}@example.test`),
    ),
  );
  await db.delete(usersTable).where(eq(usersTable.id, employeeAId));
  await db.delete(usersTable).where(eq(usersTable.id, employeeBId));
});

describe("property document authorization and lifecycle", () => {
  it("denies unauthenticated and ungranted employee actions by default", async () => {
    setUser(null);
    const unauthenticated = await request(
      appWith(router),
      "/employee/property-documents/properties",
    );
    expect(unauthenticated.status).toBe(401);

    const employeeA = (await db.select().from(usersTable).where(eq(usersTable.id, employeeAId)))[0]!;
    const denied = await createIntent(employeeA);
    expect(denied.status).toBe(403);
  });

  it("supports grants/revokes and isolates employee visibility", async () => {
    const employees = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "employee"));
    const employeeA = employees.find((row) => row.id === employeeAId)!;
    const employeeB = employees.find((row) => row.id === employeeBId)!;
    expect((await grant(employeeAId)).status).toBe(200);

    const pdf = await validPdf();
    const intentResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    expect(intentResponse.status).toBe(201);
    const intentBody = (await intentResponse.json()) as {
      intentId: string;
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
    };
    expect(intentBody.uploadHeaders["content-length"]).toBe(String(pdf.length));
    expect(intentBody.uploadHeaders["content-type"]).toBe("application/pdf");
    const streamed = await request(
      appWith(router),
      new URL(intentBody.uploadUrl).pathname.replace(/^\/api/, ""),
      {
        method: "PUT",
        headers: intentBody.uploadHeaders,
        body: pdf,
      },
    );
    expect(streamed.status).toBe(201);
    await setStage(intentBody.intentId, pdf, "application/pdf");

    setUser(employeeA);
    const finalized = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${intentBody.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(finalized.status).toBe(200);
    const document = (await finalized.json()) as { id: string; status: string };
    expect(document.status).toBe("pending");

    setUser(employeeA);
    const own = await request(appWith(router), "/employee/property-documents");
    expect(own.status).toBe(200);
    expect(((await own.json()) as Array<{ id: string }>).some((row) => row.id === document.id)).toBe(true);

    setUser(employeeB);
    const other = await request(appWith(router), "/employee/property-documents");
    expect(other.status).toBe(200);
    expect(((await other.json()) as Array<{ id: string }>).some((row) => row.id === document.id)).toBe(false);
    const otherDownload = await request(
      appWith(router),
      `/employee/property-documents/${document.id}/download`,
    );
    expect(otherDownload.status).toBe(403);

    storageState.sizeOverride = 20 * 1024 * 1024 + 1;
    setUser(employeeA);
    const oversizedDownload = await request(
      appWith(router),
      `/employee/property-documents/${document.id}/download`,
    );
    expect(oversizedDownload.status).toBe(413);
    storageState.sizeOverride = null;

    setUser((await db.select().from(usersTable).where(eq(usersTable.id, adminId)))[0]!);
    const adminList = await request(
      appWith(router),
      `/admin/property-documents?propertyId=${propertyId}`,
    );
    expect(adminList.status).toBe(200);
    expect(((await adminList.json()) as Array<{ id: string }>).some((row) => row.id === document.id)).toBe(true);

    const pendingResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const pendingIntent = (await pendingResponse.json()) as { intentId: string };
    await setStage(pendingIntent.intentId, pdf, "application/pdf");
    expect((await revoke(employeeAId)).status).toBe(200);
    setUser(employeeA);
    const deniedNewIntent = await createIntent(employeeA);
    expect(deniedNewIntent.status).toBe(403);
    const deniedFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${pendingIntent.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(deniedFinalize.status).toBe(403);
    const deniedDownload = await request(
      appWith(router),
      `/employee/property-documents/${document.id}/download`,
    );
    expect(deniedDownload.status).toBe(403);
  });

  it("permits admin-only review, requires rejection reasons, and makes review immutable", async () => {
    const employeeA = (await db.select().from(usersTable).where(eq(usersTable.id, employeeAId)))[0]!;
    expect((await grant(employeeAId)).status).toBe(200);
    const pdf = await validPdf();
    const intentResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const intentBody = (await intentResponse.json()) as { intentId: string };
    await setStage(intentBody.intentId, pdf, "application/pdf");
    setUser(employeeA);
    const finalized = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${intentBody.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    const document = (await finalized.json()) as { id: string };

    const staffReview = await request(
      appWith(router),
      `/employee/property-documents/${document.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "approved" }) },
    );
    expect(staffReview.status).toBe(404);

    setUser((await db.select().from(usersTable).where(eq(usersTable.id, adminId)))[0]!);
    const missingReason = await request(
      appWith(router),
      `/admin/property-documents/${document.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "rejected", reason: " " }) },
    );
    expect(missingReason.status).toBe(400);
    const approved = await request(
      appWith(router),
      `/admin/property-documents/${document.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "approved" }) },
    );
    expect(approved.status).toBe(200);
    expect((await approved.json() as { status: string }).status).toBe("approved");
    const immutable = await request(
      appWith(router),
      `/admin/property-documents/${document.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "rejected", reason: "Too old" }) },
    );
    expect(immutable.status).toBe(409);

    const secondIntentResponse = await (async () => {
      setUser(employeeA);
      return createIntent(employeeA, "application/pdf", pdf.length);
    })();
    const secondIntent = (await secondIntentResponse.json()) as { intentId: string };
    await setStage(secondIntent.intentId, pdf, "application/pdf");
    const secondFinalized = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${secondIntent.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    const secondDocument = (await secondFinalized.json()) as { id: string };
    setUser((await db.select().from(usersTable).where(eq(usersTable.id, adminId)))[0]!);
    const rejected = await request(
      appWith(router),
      `/admin/property-documents/${secondDocument.id}/review`,
      { method: "POST", body: JSON.stringify({ status: "rejected", reason: "Unreadable" }) },
    );
    expect(rejected.status).toBe(200);
    expect((await rejected.json() as { reviewReason: string }).reviewReason).toBe("Unreadable");
  });

  it("rejects invalid MIME/size metadata without creating intents", async () => {
    const employeeA = (await db.select().from(usersTable).where(eq(usersTable.id, employeeAId)))[0]!;
    expect((await grant(employeeAId)).status).toBe(200);
    const before = await db
      .select({ count: count() })
      .from(propertyDocumentUploadIntentsTable)
      .where(eq(propertyDocumentUploadIntentsTable.requestedBy, employeeAId));
    const badMime = await createIntent(employeeA, "text/plain", 100);
    expect(badMime.status).toBe(400);
    const tooLarge = await createIntent(employeeA, "application/pdf", 20 * 1024 * 1024 + 1);
    expect(tooLarge.status).toBe(400);
    const after = await db
      .select({ count: count() })
      .from(propertyDocumentUploadIntentsTable)
      .where(eq(propertyDocumentUploadIntentsTable.requestedBy, employeeAId));
    expect(after[0]!.count).toBe(before[0]!.count);
  });

  it("prevents intent spoofing, invalid bytes, storage failures, and supports idempotent finalize", async () => {
    const employees = await db.select().from(usersTable).where(eq(usersTable.role, "employee"));
    const employeeA = employees.find((row) => row.id === employeeAId)!;
    const employeeB = employees.find((row) => row.id === employeeBId)!;
    expect((await grant(employeeAId)).status).toBe(200);
    expect((await grant(employeeBId)).status).toBe(200);

    const pdf = await validPdf();
    const spoofResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const spoof = (await spoofResponse.json()) as { intentId: string };
    await setStage(spoof.intentId, pdf, "application/pdf");
    const beforeSpoof = await db
      .select({ count: count() })
      .from(propertyDocumentsTable)
      .where(eq(propertyDocumentsTable.uploadedBy, employeeAId));
    setUser(employeeB);
    const spoofFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${spoof.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(spoofFinalize.status).toBe(403);
    const spoofDocuments = await db
      .select({ count: count() })
      .from(propertyDocumentsTable)
      .where(eq(propertyDocumentsTable.uploadedBy, employeeAId));
    expect(spoofDocuments[0]!.count).toBe(beforeSpoof[0]!.count);

    setUser(employeeA);
    const overwriteResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const overwrite = (await overwriteResponse.json()) as { intentId: string };
    await setStage(overwrite.intentId, pdf, "application/pdf");
    storageState.overwriteOnPin = true;
    const overwriteFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${overwrite.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(overwriteFinalize.status).toBe(400);
    storageState.overwriteOnPin = false;

    const badResponse = await createIntent(employeeA, "application/pdf", 4);
    const bad = (await badResponse.json()) as { intentId: string };
    await setStage(bad.intentId, Buffer.from("nope"), "application/pdf");
    const badFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${bad.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(badFinalize.status).toBe(400);

    const mismatchResponse = await createIntent(employeeA, "application/pdf", pdf.length + 1);
    const mismatch = (await mismatchResponse.json()) as { intentId: string };
    await setStage(mismatch.intentId, pdf, "application/pdf");
    const mismatchFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${mismatch.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(mismatchFinalize.status).toBe(400);

    const missingResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const missing = (await missingResponse.json()) as { intentId: string };
    const missingFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${missing.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(missingFinalize.status).toBe(400);

    storageState.failWrite = true;
    const failedResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const failed = (await failedResponse.json()) as { intentId: string };
    await setStage(failed.intentId, pdf, "application/pdf");
    const beforeStorageFailure = await db
      .select({ count: count() })
      .from(propertyDocumentsTable)
      .where(eq(propertyDocumentsTable.propertyId, propertyId));
    const failedFinalize = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${failed.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    expect(failedFinalize.status).toBe(500);
    storageState.failWrite = false;
    const [failedIntent] = await db
      .select()
      .from(propertyDocumentUploadIntentsTable)
      .where(eq(propertyDocumentUploadIntentsTable.id, failed.intentId));
    expect(failedIntent!.status).toBe("failed");
    const afterStorageFailure = await db
      .select({ count: count() })
      .from(propertyDocumentsTable)
      .where(eq(propertyDocumentsTable.propertyId, propertyId));
    expect(afterStorageFailure[0]!.count).toBe(beforeStorageFailure[0]!.count);

    const repeatResponse = await createIntent(employeeA, "application/pdf", pdf.length);
    const repeat = (await repeatResponse.json()) as { intentId: string };
    await setStage(repeat.intentId, pdf, "application/pdf");
    const first = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${repeat.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    const firstBody = (await first.json()) as { id: string };
    const second = await request(
      appWith(router),
      `/employee/property-documents/upload-intents/${repeat.intentId}/finalize`,
      { method: "POST", body: "{}" },
    );
    const secondBody = (await second.json()) as { id: string };
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.id).toBe(firstBody.id);
  });

  it("sweeps expired staging intents and removes their objects", async () => {
    const employeeA = (await db.select().from(usersTable).where(eq(usersTable.id, employeeAId)))[0]!;
    expect((await grant(employeeAId)).status).toBe(200);
    const response = await createIntent(employeeA, "application/pdf", 100);
    const body = (await response.json()) as { intentId: string };
    const intent = await setStage(body.intentId, Buffer.from("%PDF-\n%%EOF"), "application/pdf");
    const { cleanupExpiredPropertyDocumentStaging } = await import("./propertyDocuments");
    await db
      .update(propertyDocumentUploadIntentsTable)
      .set({ expiresAt: new Date(0) })
      .where(eq(propertyDocumentUploadIntentsTable.id, body.intentId));
    await cleanupExpiredPropertyDocumentStaging(new Date());
    const [expired] = await db
      .select()
      .from(propertyDocumentUploadIntentsTable)
      .where(eq(propertyDocumentUploadIntentsTable.id, body.intentId));
    expect(expired!.status).toBe("expired");
    expect(storageState.objects.has(intent.stageKey)).toBe(false);
  });
});

describe("property document compression and legacy path protection", () => {
  it("resizes/compresses images and falls back to smaller originals", async () => {
    const raw = randomBytes(3000 * 2000 * 3);
    const large = await sharp(raw, {
      raw: { width: 3000, height: 2000, channels: 3 },
    }).jpeg({ quality: 100 }).toBuffer();
    const optimized = await (await import("./propertyDocuments")).optimizeDocument(
      large,
      "image/jpeg",
    );
    expect(optimized.length).toBeLessThan(large.length);
    const metadata = await sharp(optimized).metadata();
    expect(metadata.width).toBeLessThanOrEqual(2400);
    expect(metadata.height).toBeLessThanOrEqual(2400);

    const tiny = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 240, g: 20, b: 20 },
      },
    }).jpeg({ quality: 30 }).toBuffer();
    const sanitized = await (await import("./propertyDocuments")).optimizeDocument(
      tiny,
      "image/jpeg",
    );
    expect(sanitized.equals(tiny)).toBe(false);
    expect((await sharp(sanitized).metadata()).format).toBe("jpeg");

    const bomb = await sharp({
      create: {
        width: 5000,
        height: 5000,
        channels: 3,
        background: { r: 30, g: 40, b: 50 },
      },
    }).jpeg({ quality: 30 }).toBuffer();
    await expect(
      (await import("./propertyDocuments")).optimizeDocument(bomb, "image/jpeg"),
    ).rejects.toThrow("Invalid image document");
  });

  it("keeps valid PDFs readable and rejects real signatures and fake encryption tokens", async () => {
    const pdf = await validPdf();
    const optimized = await (await import("./propertyDocuments")).optimizeDocument(
      pdf,
      "application/pdf",
    );
    await PDFDocument.load(optimized);
    const optimizeDocument = (await import("./propertyDocuments")).optimizeDocument;
    const fakeSigned = Buffer.concat([pdf, Buffer.from("\n/ByteRange [0 1 2 3]")]);
    const sanitizedFake = await optimizeDocument(fakeSigned, "application/pdf");
    expect(sanitizedFake.equals(fakeSigned)).toBe(false);
    await PDFDocument.load(sanitizedFake);
    const signedPdf = await PDFDocument.create();
    const page = signedPdf.addPage([240, 180]);
    const signature = signedPdf.context.register(
      signedPdf.context.obj({
        Type: PDFName.of("Sig"),
        ByteRange: signedPdf.context.obj([0, 1, 2, 3]),
      }),
    );
    const widget = signedPdf.context.register(
      signedPdf.context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("Widget"),
        FT: PDFName.of("Sig"),
        V: signature,
        Rect: signedPdf.context.obj([0, 0, 0, 0]),
      }),
    );
    page.node.set(PDFName.of("Annots"), signedPdf.context.obj([widget]));
    const signed = Buffer.from(await signedPdf.save());
    await expect(optimizeDocument(signed, "application/pdf")).rejects.toThrow(
      "Signed PDFs are not supported",
    );
    const fakeEncrypted = Buffer.from("%PDF-1.7\n/Encrypt 7 0 R\nnot a PDF");
    await expect(optimizeDocument(fakeEncrypted, "application/pdf")).rejects.toThrow(
      "Invalid PDF document",
    );
  });

  it("denies raw and repeatedly encoded document prefixes in legacy storage routes", async () => {
    const { isPropertyDocumentPath } = await import("./storage");
    for (const path of [
      "property-documents/final/id",
      "property-documents%2Ffinal%2Fid",
      "property-documents%252Ffinal%252Fid",
      "foo/..%2Fproperty-documents%2Ffinal%2Fid",
      "property_documents/staging/id",
    ]) {
      expect(isPropertyDocumentPath(path)).toBe(true);
    }
    const app = appWith(storageRouter);
    const raw = await request(app, "/storage/objects/property-documents/final/id");
    const encoded = await request(
      app,
      "/storage/objects/property-documents%2Ffinal%2Fid",
    );
    const publicRaw = await request(app, "/storage/public-objects/property-documents/final/id");
    const publicEncoded = await request(
      app,
      "/storage/public-objects/property-documents%2Ffinal%2Fid",
    );
    expect(raw.status).toBe(404);
    expect(encoded.status).toBe(404);
    expect(publicRaw.status).toBe(404);
    expect(publicEncoded.status).toBe(404);
  });
});