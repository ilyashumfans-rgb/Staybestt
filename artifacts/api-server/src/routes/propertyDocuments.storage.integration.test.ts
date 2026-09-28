import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import express from "express";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";
import {
  db,
  agentAgreementDocumentsTable,
  propertiesTable,
  propertyDocumentsTable,
  usersTable,
  type User,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

// Only the identity is substituted; the storage service, private bucket,
// property/document rows, pinned reads and HTTP response are all real.
const auth = vi.hoisted(() => ({ current: null as User | null }));
vi.mock("../lib/auth", () => ({
  resolveUser: vi.fn(async () => auth.current),
}));

it("streams immutable synthetic private bytes to owner and admin without hanging", async () => {
  const router = (await import("./propertyDocuments")).default;
  const storage = new ObjectStorageService();
  const suffix = randomUUID();
  const partnerId = `property-document-integration-partner-${suffix}`;
  const adminId = `property-document-integration-admin-${suffix}`;
  const objectId = randomUUID();
  const storageKey = `property-documents/final/${objectId}-g1`;
  let propertyId: number | undefined;
  let savedObject = false;
  try {
    const [partner, administrator] = await db.insert(usersTable).values([
      { id: partnerId, email: `${partnerId}@example.invalid`, name: "Synthetic Partner",
        role: "partner", status: "active", approvalStatus: "approved" },
      { id: adminId, email: `${adminId}@example.invalid`, name: "Synthetic Admin",
        role: "admin", status: "active", approvalStatus: "approved" },
    ]).returning();
    const [property] = await db.insert(propertiesTable).values({
      ownerId: partnerId,
      name: "Synthetic private document test",
      category: "budget",
      country: "India",
      state: "Test State",
      city: "Test City",
      area: "Test Area",
      address: "Test Address",
      description: "Temporary integration fixture",
      imageUrl: "https://example.invalid/test.jpg",
      startingPrice: 100,
      status: "active",
    }).returning();
    propertyId = property.id;
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    const bytes = Buffer.from(await pdf.save());
    await storage.writePrivateObject(storageKey, bytes, "application/pdf");
    savedObject = true;
    const [document] = await db.insert(propertyDocumentsTable).values({
      propertyId,
      uploadedBy: partnerId,
      originalName: "signed-hotel-agreement-test.pdf",
      originalBytes: bytes.length,
      storedBytes: bytes.length,
      contentType: "application/pdf",
      storageKey,
      status: "pending",
      generation: 1,
    }).returning();

    const app = express();
    app.use((req, _res, next) => {
      (req as any).log = { error() {}, warn() {} };
      next();
    });
    app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test port");
      for (const [actor, endpoint] of [
        [partner, `/partner/property-documents/${document.id}/download`],
        [administrator, `/admin/property-documents/${document.id}/download`],
      ] as const) {
        auth.current = actor;
        const response = await fetch(`http://127.0.0.1:${address.port}${endpoint}`, {
          signal: AbortSignal.timeout(10000),
        });
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    } finally {
      server.closeAllConnections();
      server.close();
      auth.current = null;
    }
  } finally {
    if (propertyId) {
      await db.delete(propertyDocumentsTable).where(eq(propertyDocumentsTable.propertyId, propertyId));
      await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
    }
    if (savedObject) await storage.deletePrivateObject(storageKey);
    await db.delete(usersTable).where(eq(usersTable.id, partnerId));
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
  }
}, 60000);

it("uploads and downloads a private agent account agreement and links only an owned property", async () => {
  const router = (await import("./propertyDocuments")).default;
  const storage = new ObjectStorageService();
  const suffix = randomUUID();
  const agentId = `agent-agreement-integration-${suffix}`;
  const adminId = `agent-agreement-integration-admin-${suffix}`;
  const foreignAgentId = `agent-agreement-integration-other-${suffix}`;
  let propertyId: number | undefined;
  let foreignPropertyId: number | undefined;
  try {
    const [agent, administrator] = await db.insert(usersTable).values([
      { id: agentId, email: `${agentId}@example.invalid`, name: "Synthetic Agent",
        role: "agent", status: "active", approvalStatus: "approved" },
      { id: adminId, email: `${adminId}@example.invalid`, name: "Synthetic Admin",
        role: "admin", status: "active", approvalStatus: "approved" },
      { id: foreignAgentId, email: `${foreignAgentId}@example.invalid`, name: "Other Agent",
        role: "agent", status: "active", approvalStatus: "approved" },
    ]).returning();
    const [property] = await db.insert(propertiesTable).values({
      ownerId: agentId, name: "Synthetic agent submitted property", category: "budget",
      city: "Test City", area: "Test Area", address: "Test address", description: "Test fixture",
      imageUrl: "https://example.invalid/agent-test.jpg", startingPrice: 100, status: "pending",
    }).returning();
    propertyId = property.id;
    const [foreignProperty] = await db.insert(propertiesTable).values({
      ownerId: foreignAgentId, name: "Other agent property", category: "budget",
      city: "Test City", area: "Test Area", address: "Test address", description: "Test fixture",
      imageUrl: "https://example.invalid/other-test.jpg", startingPrice: 100, status: "pending",
    }).returning();
    foreignPropertyId = foreignProperty.id;
    const pdf = await PDFDocument.create();
    pdf.addPage([240, 190]);
    const bytes = Buffer.from(await pdf.save());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).log = { error() {}, warn() {} }; next(); });
    app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test port");
      const base = `http://127.0.0.1:${address.port}`;
      const [pendingAgent] = await db.update(usersTable).set({ approvalStatus: "pending" })
        .where(eq(usersTable.id, agentId)).returning();
      auth.current = pendingAgent;
      expect((await fetch(`${base}/agent/agreement`)).status).toBe(200);
      const [blockedAgent] = await db.update(usersTable).set({ status: "blocked" })
        .where(eq(usersTable.id, agentId)).returning();
      auth.current = blockedAgent;
      expect((await fetch(`${base}/agent/agreement`)).status).toBe(403);
      await db.update(usersTable).set({ status: "active", approvalStatus: "approved" })
        .where(eq(usersTable.id, agentId));
      auth.current = agent;
      const denied = await fetch(`${base}/agent/agreement-documents?propertyId=${foreignPropertyId}`, {
        method: "POST", headers: { "Content-Type": "application/pdf" }, body: bytes,
      });
      expect(denied.status).toBe(404);
      expect((await fetch(`${base}/agent/agreement?propertyId=${foreignPropertyId}`)).status).toBe(404);
      const agreement = await fetch(`${base}/agent/agreement`, { signal: AbortSignal.timeout(30000) });
      expect(agreement.status).toBe(200);
      const generated = await agreement.arrayBuffer();
      if (process.env.RENDER_AGENT_AGREEMENT) {
        await writeFile("/tmp/agent-agreement-review.pdf", Buffer.from(generated));
      }
      const rendered = await PDFDocument.load(generated);
      expect(rendered.getPageCount()).toBeGreaterThan(5);
      const created = await fetch(`${base}/agent/agreement-documents`, {
        method: "POST", headers: { "Content-Type": "application/pdf" },
        body: bytes, signal: AbortSignal.timeout(30000),
      });
      expect(created.status).toBe(201);
      const document = await created.json() as { id: string; propertyId: number | null };
      expect(document.propertyId).toBeNull();
      const [saved] = await db.select().from(agentAgreementDocumentsTable)
        .where(eq(agentAgreementDocumentsTable.id, document.id));
      auth.current = agent;
      const accountDownload = await fetch(`${base}/agent/agreement-documents/${document.id}/download`, {
        signal: AbortSignal.timeout(20000),
      });
      expect(accountDownload.status).toBe(200);
      const optimizedBytes = Buffer.from(await accountDownload.arrayBuffer());
      expect(optimizedBytes.length).toBe(saved.storedBytes);
      expect((await PDFDocument.load(optimizedBytes)).getPageCount()).toBe(1);
      const deniedLink = await fetch(`${base}/agent/agreement-documents/${document.id}/link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: foreignPropertyId }),
      });
      expect(deniedLink.status).toBe(404);
      const linked = await fetch(`${base}/agent/agreement-documents/${document.id}/link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      expect(linked.status).toBe(200);
      expect(((await linked.json()) as {propertyId: number}).propertyId).toBe(propertyId);
      const propertyUpload = await fetch(`${base}/agent/agreement-documents?propertyId=${propertyId}`, {
        method: "POST", headers: { "Content-Type": "application/pdf" },
        body: bytes, signal: AbortSignal.timeout(30000),
      });
      expect(propertyUpload.status).toBe(201);
      const propertyDocument = await propertyUpload.json() as { id: string; propertyId: number };
      expect(propertyDocument.propertyId).toBe(propertyId);
      auth.current = administrator;
      const adminDownload = await fetch(`${base}/admin/agent-agreement-documents/${document.id}/download`, {
        signal: AbortSignal.timeout(20000),
      });
      expect(adminDownload.status).toBe(200);
      expect(Buffer.from(await adminDownload.arrayBuffer())).toEqual(optimizedBytes);
      const listed = await fetch(`${base}/admin/agent-agreement-documents`);
      expect(((await listed.json()) as Array<{id: string; propertyId: number}>)
        .some(record => record.id === document.id && record.propertyId === propertyId)).toBe(true);
      const reviewed = await fetch(`${base}/admin/agent-agreement-documents/${document.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(reviewed.status).toBe(200);
      expect(((await reviewed.json()) as { status: string }).status).toBe("approved");
    } finally {
      server.closeAllConnections();
      server.close();
      auth.current = null;
    }
  } finally {
    const temporary = await db.delete(agentAgreementDocumentsTable)
      .where(eq(agentAgreementDocumentsTable.agentId, agentId)).returning();
    for (const document of temporary) await storage.deletePrivateObject(document.storageKey);
    if (propertyId) await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
    if (foreignPropertyId) await db.delete(propertiesTable).where(eq(propertiesTable.id, foreignPropertyId));
    await db.delete(usersTable).where(eq(usersTable.id, agentId));
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
    await db.delete(usersTable).where(eq(usersTable.id, foreignAgentId));
  }
}, 60000);