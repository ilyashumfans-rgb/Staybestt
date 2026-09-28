import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import type { File } from "@google-cloud/storage";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  eq,
  inArray,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  propertiesTable,
  propertyDocumentsTable,
  propertyDocumentUploadGrantsTable,
  propertyDocumentUploadIntentsTable,
  usersTable,
} from "@workspace/db";
import * as z from "@workspace/api-zod";
import { resolveUser } from "../lib/auth";
import { hasAdminToken } from "./admin";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import sharp from "sharp";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24 * 1000 * 1000;
const INTENT_TTL_MS = 15 * 60 * 1000;
const STAGING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DOCUMENT_STREAM_TIMEOUT_MS = 30_000;
const CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
type PropertyDocumentContentType = (typeof CONTENT_TYPES)[number];

class PropertyDocumentValidationError extends Error {
  status = 400;
}

async function requireActiveEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (user.role !== "employee" || user.status !== "active" || user.approvalStatus !== "approved") {
    res.status(403).json({ message: "Active employee access required" });
    return;
  }
  req.currentUser = user;
  next();
}

async function requireActiveEmployeeUploader(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireActiveEmployee(req, res, async () => {
    if (!(await hasActiveUploadGrant(req.currentUser!.id))) {
      res.status(403).json({ message: "Property document upload permission is not enabled" });
      return;
    }
    next();
  });
}

async function requirePropertyDocumentAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (hasAdminToken(req)) {
    next();
    return;
  }
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (user.role !== "admin" || user.status !== "active" || user.approvalStatus !== "approved") {
    res.status(403).json({ message: "Active administrator access required" });
    return;
  }
  req.currentUser = user;
  next();
}

async function hasActiveUploadGrant(userId: string): Promise<boolean> {
  const [grant] = await db
    .select({ id: propertyDocumentUploadGrantsTable.id })
    .from(propertyDocumentUploadGrantsTable)
    .where(
      and(
        eq(propertyDocumentUploadGrantsTable.userId, userId),
        eq(propertyDocumentUploadGrantsTable.active, true),
      ),
    )
    .limit(1);
  return Boolean(grant);
}

async function actorId(req: Request): Promise<string> {
  if (req.currentUser?.id) return req.currentUser.id;
  // The legacy credential-token admin has no Clerk identity. Keep its audit
  // identity explicit and local rather than allowing a null FK.
  const id = "system:property-documents-admin";
  await db
    .insert(usersTable)
    .values({
      id,
      email: "property-documents-admin@staybest.invalid",
      name: "Property Documents Admin",
      role: "admin",
      status: "active",
      approvalStatus: "approved",
    })
    .onConflictDoNothing();
  return id;
}

function parseContentType(value: string): PropertyDocumentContentType {
  if ((CONTENT_TYPES as readonly string[]).includes(value)) return value as PropertyDocumentContentType;
  throw new PropertyDocumentValidationError("Unsupported document type");
}

function propertySelector(row: typeof propertiesTable.$inferSelect) {
  return { id: row.id, propertyNumber: row.propertyNumber, name: row.name };
}

function documentDto(row: {
  document: typeof propertyDocumentsTable.$inferSelect;
  property: typeof propertiesTable.$inferSelect;
  uploader: typeof usersTable.$inferSelect;
}) {
  const { document, property, uploader } = row;
  return {
    id: document.id,
    propertyId: document.propertyId,
    propertyNumber: property.propertyNumber,
    propertyName: property.name,
    uploadedBy: document.uploadedBy,
    uploaderName: uploader.name,
    originalName: document.originalName,
    originalBytes: document.originalBytes,
    storedBytes: document.storedBytes,
    contentType: document.contentType,
    status: document.status,
    reviewedBy: document.reviewedBy,
    reviewedAt: document.reviewedAt?.toISOString() ?? null,
    reviewReason: document.reviewReason,
    createdAt: document.createdAt.toISOString(),
  };
}

const uploaderAlias = alias(usersTable, "property_document_uploader");

async function findDocument(documentId: string) {
  const [row] = await db
    .select({
      document: propertyDocumentsTable,
      property: propertiesTable,
      uploader: uploaderAlias,
    })
    .from(propertyDocumentsTable)
    .innerJoin(propertiesTable, eq(propertyDocumentsTable.propertyId, propertiesTable.id))
    .innerJoin(uploaderAlias, eq(propertyDocumentsTable.uploadedBy, uploaderAlias.id))
    .where(eq(propertyDocumentsTable.id, documentId))
    .limit(1);
  return row;
}

function searchTerm(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? `%${trimmed}%` : undefined;
}

async function listProperties(req: Request, res: Response, admin: boolean): Promise<void> {
  const parsed = (admin
    ? z.ListAdminPropertyDocumentPropertiesQueryParams
    : z.ListEmployeePropertyDocumentPropertiesQueryParams
  ).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid search" });
    return;
  }
  const term = searchTerm(parsed.data.search);
  const conditions = [sql`${propertiesTable.status} <> 'rejected'`];
  if (term) {
    conditions.push(
      or(
        ilike(propertiesTable.name, term),
        sql`${propertiesTable.propertyNumber}::text ilike ${term}`,
      ) as any,
    );
  }
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(and(...conditions))
    .orderBy(asc(propertiesTable.propertyNumber))
    .limit(100);
  const payload = rows.map(propertySelector);
  res.json(
    (admin
      ? z.ListAdminPropertyDocumentPropertiesResponse
      : z.ListEmployeePropertyDocumentPropertiesResponse
    ).parse(payload),
  );
}

async function listDocuments(req: Request, res: Response, admin: boolean): Promise<void> {
  const parsed = admin
    ? z.ListAdminPropertyDocumentsQueryParams.safeParse(req.query)
    : { success: true as const, data: {} };
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid document filters" });
    return;
  }
  const query = parsed.data;
  const conditions = [];
  if (!admin) conditions.push(eq(propertyDocumentsTable.uploadedBy, req.currentUser!.id));
  if (admin && query.propertyId) conditions.push(eq(propertyDocumentsTable.propertyId, query.propertyId));
  if (admin && query.status) conditions.push(eq(propertyDocumentsTable.status, query.status));
  if (admin) {
    const term = searchTerm(query.search);
    if (term) {
      conditions.push(
        or(
          ilike(propertiesTable.name, term),
          ilike(propertyDocumentsTable.originalName, term),
          sql`${propertiesTable.propertyNumber}::text ilike ${term}`,
        ) as any,
      );
    }
  }
  const rows = await db
    .select({
      document: propertyDocumentsTable,
      property: propertiesTable,
      uploader: uploaderAlias,
    })
    .from(propertyDocumentsTable)
    .innerJoin(propertiesTable, eq(propertyDocumentsTable.propertyId, propertiesTable.id))
    .innerJoin(uploaderAlias, eq(propertyDocumentsTable.uploadedBy, uploaderAlias.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${propertyDocumentsTable.createdAt} desc`);
  const payload = rows.map(documentDto);
  res.json(
    (admin ? z.ListAdminPropertyDocumentsResponse : z.ListEmployeePropertyDocumentsResponse).parse(payload),
  );
}

async function createUploadIntent(req: Request, res: Response, admin: boolean): Promise<void> {
  await cleanupExpiredPropertyDocumentStaging();
  const parsed = (admin
    ? z.CreateAdminPropertyDocumentUploadIntentBody
    : z.CreateEmployeePropertyDocumentUploadIntentBody
  ).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid upload metadata" });
    return;
  }
  const { propertyId, originalName, originalBytes, contentType } = parsed.data;
  const cleanName = originalName.trim();
  if (!cleanName) {
    res.status(400).json({ message: "A document filename is required" });
    return;
  }
  const property = await db.query.propertiesTable.findFirst({
    where: eq(propertiesTable.id, propertyId),
  });
  if (!property || property.status === "rejected") {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  const actor = await actorId(req);
  const intentId = randomUUID();
  const stageKey = `property-documents/staging/${intentId}`;
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
  await db.insert(propertyDocumentUploadIntentsTable).values({
    id: intentId,
    propertyId,
    requestedBy: actor,
    stageKey,
    originalName: cleanName,
    contentType: parseContentType(contentType),
    declaredBytes: originalBytes,
    expiresAt,
  });
  try {
    const uploadUrl = propertyDocumentUploadURL(req, intentId, admin);
    const payload = {
      intentId,
      uploadUrl,
      uploadHeaders: {
        "content-length": String(originalBytes),
        "content-type": parseContentType(contentType),
      },
      expiresAt: expiresAt.toISOString(),
    };
    res.status(201).json(
      (admin
        ? z.CreateAdminPropertyDocumentUploadIntentResponse
        : z.CreateEmployeePropertyDocumentUploadIntentResponse
      ).parse(payload),
    );
  } catch (error) {
    await db
      .update(propertyDocumentUploadIntentsTable)
      .set({ status: "failed" })
      .where(eq(propertyDocumentUploadIntentsTable.id, intentId));
    req.log.error({ err: error }, "Failed to create property document upload URL");
    res.status(500).json({ message: "Failed to create upload URL" });
  }
}

function propertyDocumentUploadURL(req: Request, intentId: string, admin: boolean): string {
  const protocol = (req.get("x-forwarded-proto")?.split(",")[0] ?? req.protocol).trim();
  const host = req.get("host");
  if (!host) throw new Error("Request host is unavailable");
  const path = admin
    ? `/api/admin/property-documents/upload-intents/${intentId}/content`
    : `/api/employee/property-documents/upload-intents/${intentId}/content`;
  return `${protocol}://${host}${path}`;
}

async function uploadIntentContent(req: Request, res: Response, admin: boolean): Promise<void> {
  const parsed = (admin
    ? z.UploadAdminPropertyDocumentContentParams
    : z.UploadEmployeePropertyDocumentContentParams
  ).safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid upload intent" });
    return;
  }
  const intentId = parsed.data.intentId;
  const intent = await db.query.propertyDocumentUploadIntentsTable.findFirst({
    where: eq(propertyDocumentUploadIntentsTable.id, intentId),
  });
  if (!intent) {
    res.status(404).json({ message: "Upload intent not found" });
    return;
  }
  if (intent.requestedBy !== await actorId(req)) {
    res.status(403).json({ message: "Upload intent belongs to another user" });
    return;
  }
  if (intent.status !== "pending") {
    res.status(409).json({ message: "Upload intent is no longer usable" });
    return;
  }
  if (intent.expiresAt.getTime() <= Date.now()) {
    await failPendingIntent(intentId, intent.stageKey);
    res.status(410).json({ message: "Upload intent expired" });
    return;
  }
  const contentLength = Number(req.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength !== intent.declaredBytes) {
    await failPendingIntent(intentId, intent.stageKey);
    res.status(contentLength > MAX_BYTES ? 413 : 400).json({
      message: "Content-Length must exactly match the declared upload size",
    });
    return;
  }
  if (contentLength > MAX_BYTES) {
    await failPendingIntent(intentId, intent.stageKey);
    res.status(413).json({ message: "Upload exceeds the 20 MiB maximum" });
    return;
  }
  let contentType: PropertyDocumentContentType;
  try {
    contentType = parseContentType((req.get("content-type") ?? "").split(";")[0].trim());
  } catch (error) {
    await failPendingIntent(intentId, intent.stageKey);
    res.status(400).json({ message: (error as Error).message });
    return;
  }
  if (contentType !== parseContentType(intent.contentType)) {
    await failPendingIntent(intentId, intent.stageKey);
    res.status(400).json({ message: "Content-Type does not match the declared upload type" });
    return;
  }
  try {
    const bytes = await storage.writePrivateObjectStream(
      intent.stageKey,
      req,
      MAX_BYTES,
      contentType,
    );
    if (bytes !== intent.declaredBytes) {
      await failPendingIntent(intentId, intent.stageKey);
      res.status(400).json({ message: "Uploaded size does not match the declared size" });
      return;
    }
    res.status(201).json({ intentId, bytes });
  } catch (error) {
    await failPendingIntent(intentId, intent.stageKey);
    if (error instanceof Error && error.message.startsWith("Object exceeds")) {
      res.status(413).json({ message: "Upload exceeds the 20 MiB maximum" });
      return;
    }
    req.log.error({ err: error, intentId }, "Failed to receive property document upload");
    res.status(500).json({ message: "Failed to receive document upload" });
  }
}

export function hasMagicBytes(contents: Buffer, contentType: PropertyDocumentContentType): boolean {
  if (contentType === "application/pdf") return contents.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "image/jpeg") {
    return contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff;
  }
  if (contentType === "image/png") {
    return contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return contents.length >= 12 && contents.subarray(0, 4).toString("ascii") === "RIFF" &&
    contents.subarray(8, 12).toString("ascii") === "WEBP";
}

export async function optimizeDocument(
  contents: Buffer,
  contentType: PropertyDocumentContentType,
): Promise<Buffer> {
  if (contents.length > MAX_BYTES) {
    throw new PropertyDocumentValidationError("Document exceeds the 20 MiB maximum");
  }
  if (contentType === "application/pdf") {
    try {
      if (
        !contents.includes(Buffer.from("startxref")) ||
        !contents.includes(Buffer.from("%%EOF"))
      ) {
        throw new PropertyDocumentValidationError("Invalid PDF document");
      }
      const pdf = await withTimeout(
        PDFDocument.load(contents, { ignoreEncryption: false, updateMetadata: false }),
        DOCUMENT_STREAM_TIMEOUT_MS,
      );
      if (pdf.context.trailerInfo.Encrypt) {
        throw new PropertyDocumentValidationError(
          "Encrypted or password-protected PDFs are not supported",
        );
      }
      if (hasPdfSignature(pdf)) {
        throw new PropertyDocumentValidationError(
          "Signed PDFs are not supported; upload an unsigned PDF",
        );
      }
      const optimized = Buffer.from(
        await withTimeout(
          pdf.save({ useObjectStreams: true, addDefaultPage: false }),
          DOCUMENT_STREAM_TIMEOUT_MS,
        ),
      );
      return optimized;
    } catch (error) {
      if (error instanceof PropertyDocumentValidationError) throw error;
      const message = String(error).toLowerCase();
      if (message.includes("encrypt") || message.includes("password")) {
        throw new PropertyDocumentValidationError(
          "Encrypted or password-protected PDFs are not supported",
        );
      }
      throw new PropertyDocumentValidationError("Invalid PDF document");
    }
  }

  try {
    const image = sharp(contents, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      pages: 1,
      sequentialRead: true,
      failOn: "error",
    }).timeout({ seconds: 15 });
    const metadata = await image.metadata();
    const expectedFormat = contentType === "image/jpeg" ? "jpeg" : contentType === "image/png" ? "png" : "webp";
    if (metadata.format !== expectedFormat) {
      throw new PropertyDocumentValidationError("File content does not match its declared type");
    }
    let output = image.rotate().resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (contentType === "image/jpeg") output = output.jpeg({ quality: 85, mozjpeg: true });
    if (contentType === "image/png") output = output.png({ compressionLevel: 9 });
    if (contentType === "image/webp") output = output.webp({ quality: 85 });
    const optimized = await output.toBuffer();
    return optimized;
  } catch (error) {
    if (error instanceof PropertyDocumentValidationError) throw error;
    throw new PropertyDocumentValidationError("Invalid image document");
  }
}

function hasPdfSignature(pdf: PDFDocument): boolean {
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.has(PDFName.of("ByteRange"))) return true;
    const type = object.lookupMaybe(PDFName.of("Type"), PDFName);
    const fieldType = object.lookupMaybe(PDFName.of("FT"), PDFName);
    if (type?.toString() === "/Sig" || fieldType?.toString() === "/Sig") return true;
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Document processing timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function cleanupExpiredPropertyDocumentStaging(now = new Date()): Promise<void> {
  const stale = await db
    .select({
      id: propertyDocumentUploadIntentsTable.id,
      stageKey: propertyDocumentUploadIntentsTable.stageKey,
      status: propertyDocumentUploadIntentsTable.status,
    })
    .from(propertyDocumentUploadIntentsTable)
    .where(
      and(
        inArray(propertyDocumentUploadIntentsTable.status, ["pending", "processing", "expired", "failed"]),
        lte(propertyDocumentUploadIntentsTable.expiresAt, now),
      ),
    );
  for (const intent of stale) {
    if (intent.status === "pending" || intent.status === "processing") {
      await db
        .update(propertyDocumentUploadIntentsTable)
        .set({ status: "expired" })
        .where(
          and(
            eq(propertyDocumentUploadIntentsTable.id, intent.id),
            inArray(propertyDocumentUploadIntentsTable.status, ["pending", "processing"]),
            lte(propertyDocumentUploadIntentsTable.expiresAt, now),
          ),
        );
    }
    await storage.deletePrivateObject(intent.stageKey).catch(() => undefined);
  }
}

const stagingSweepTimer = setInterval(() => {
  void cleanupExpiredPropertyDocumentStaging().catch(() => undefined);
}, STAGING_SWEEP_INTERVAL_MS);
stagingSweepTimer.unref?.();

async function failIntent(intentId: string, stageKey: string): Promise<void> {
  await db
    .update(propertyDocumentUploadIntentsTable)
    .set({ status: "failed" })
    .where(and(eq(propertyDocumentUploadIntentsTable.id, intentId), eq(propertyDocumentUploadIntentsTable.status, "processing")));
  await storage.deletePrivateObject(stageKey).catch(() => undefined);
}

async function failPendingIntent(intentId: string, stageKey: string): Promise<void> {
  await db
    .update(propertyDocumentUploadIntentsTable)
    .set({ status: "failed" })
    .where(
      and(
        eq(propertyDocumentUploadIntentsTable.id, intentId),
        eq(propertyDocumentUploadIntentsTable.status, "pending"),
      ),
    );
  await storage.deletePrivateObject(stageKey).catch(() => undefined);
}

async function readObjectAtMost(file: File, maxBytes: number): Promise<Buffer> {
  const stream = file.createReadStream();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new PropertyDocumentValidationError("Uploaded object exceeds the 20 MiB maximum");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

async function finalizeUpload(req: Request, res: Response, admin: boolean): Promise<void> {
  const parsed = (admin
    ? z.FinalizeAdminPropertyDocumentUploadParams
    : z.FinalizeEmployeePropertyDocumentUploadParams
  ).safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid upload intent" });
    return;
  }
  const intentId = parsed.data.intentId;
  const intent = await db.query.propertyDocumentUploadIntentsTable.findFirst({
    where: eq(propertyDocumentUploadIntentsTable.id, intentId),
  });
  if (!intent) {
    res.status(404).json({ message: "Upload intent not found" });
    return;
  }
  const actor = await actorId(req);
  if (intent.requestedBy !== actor) {
    res.status(403).json({ message: "Upload intent belongs to another user" });
    return;
  }
  if (intent.status === "finalized" && intent.documentId) {
    const existing = await findDocument(intent.documentId);
    if (existing) {
      res.json(
        (admin
          ? z.FinalizeAdminPropertyDocumentUploadResponse
          : z.FinalizeEmployeePropertyDocumentUploadResponse
        ).parse(documentDto(existing)),
      );
      return;
    }
  }
  if (intent.status !== "pending") {
    res.status(409).json({ message: "Upload intent is no longer usable" });
    return;
  }
  if (intent.expiresAt.getTime() <= Date.now()) {
    await db
      .update(propertyDocumentUploadIntentsTable)
      .set({ status: "expired" })
      .where(eq(propertyDocumentUploadIntentsTable.id, intentId));
    await storage.deletePrivateObject(intent.stageKey).catch(() => undefined);
    res.status(410).json({ message: "Upload intent expired" });
    return;
  }
  const property = await db.query.propertiesTable.findFirst({
    where: eq(propertiesTable.id, intent.propertyId),
  });
  if (!property || property.status === "rejected") {
    await failIntent(intentId, intent.stageKey);
    res.status(404).json({ message: "Property not found" });
    return;
  }
  const [claimed] = await db
    .update(propertyDocumentUploadIntentsTable)
    .set({
      status: "processing",
      generation: sql`${propertyDocumentUploadIntentsTable.generation} + 1`,
    })
    .where(
      and(
        eq(propertyDocumentUploadIntentsTable.id, intentId),
        eq(propertyDocumentUploadIntentsTable.status, "pending"),
      ),
    )
    .returning();
  if (!claimed) {
    res.status(409).json({ message: "Upload is already being finalized" });
    return;
  }

  let finalKey: string | undefined;
  let committed = false;
  try {
    const stage = await storage.getPrivateObjectFileForKey(claimed.stageKey);
    const [metadata] = await stage.getMetadata();
    if (!metadata.generation) {
      throw new PropertyDocumentValidationError("Uploaded staging object has no immutable generation");
    }
    const pinnedStage = await storage.getPrivateObjectFileForKey(
      claimed.stageKey,
      true,
      metadata.generation,
    );
    const [pinnedMetadata] = await pinnedStage.getMetadata();
    if (String(pinnedMetadata.generation) !== String(metadata.generation)) {
      throw new PropertyDocumentValidationError("Uploaded staging object changed during validation");
    }
    const actualBytes = Number(metadata.size ?? 0);
    if (!Number.isSafeInteger(actualBytes) || actualBytes !== claimed.declaredBytes || actualBytes > MAX_BYTES) {
      throw new PropertyDocumentValidationError("Uploaded size does not match the declared size");
    }
    const contents = await readObjectAtMost(pinnedStage, MAX_BYTES);
    if (contents.length !== actualBytes || !hasMagicBytes(contents, parseContentType(claimed.contentType))) {
      throw new PropertyDocumentValidationError("Uploaded bytes are not a valid document of the declared type");
    }
    const type = parseContentType(claimed.contentType);
    const stored = await optimizeDocument(contents, type);
    if (stored.length > MAX_BYTES) {
      throw new PropertyDocumentValidationError("Sanitized document exceeds the 20 MiB maximum");
    }
    const documentId = randomUUID();
    finalKey = `property-documents/final/${documentId}-g${claimed.generation}`;
    await storage.writePrivateObject(finalKey, stored, type);
    const [document] = await db.transaction(async (tx) => {
      const [createdDocument] = await tx
        .insert(propertyDocumentsTable)
        .values({
          id: documentId,
          propertyId: claimed.propertyId,
          uploadedBy: claimed.requestedBy,
          originalName: claimed.originalName,
          originalBytes: claimed.declaredBytes,
          storedBytes: stored.length,
          contentType: type,
          storageKey: finalKey!,
          status: "pending",
          generation: claimed.generation,
        })
        .returning();
      const [updatedIntent] = await tx
        .update(propertyDocumentUploadIntentsTable)
        .set({
          status: "finalized",
          documentId,
          finalizedAt: new Date(),
        })
        .where(
          and(
            eq(propertyDocumentUploadIntentsTable.id, intentId),
            eq(propertyDocumentUploadIntentsTable.status, "processing"),
            eq(propertyDocumentUploadIntentsTable.generation, claimed.generation),
          ),
        )
        .returning();
      if (!updatedIntent) throw new Error("Upload generation changed during finalization");
      return [createdDocument];
    });
    committed = true;
    await storage.deletePrivateObject(claimed.stageKey).catch((error) => {
      req.log.warn({ err: error, intentId }, "Failed to clean up property document staging object");
    });
    const row = await findDocument(document.id);
    if (!row) throw new Error("Finalized property document could not be loaded");
    res.json(
      (admin
        ? z.FinalizeAdminPropertyDocumentUploadResponse
        : z.FinalizeEmployeePropertyDocumentUploadResponse
      ).parse(documentDto(row)),
    );
  } catch (error) {
    if (!committed) {
      if (finalKey) await storage.deletePrivateObject(finalKey).catch(() => undefined);
      await failIntent(intentId, claimed.stageKey);
    }
    if (error instanceof PropertyDocumentValidationError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ message: "Uploaded staging object was not found" });
      return;
    }
    req.log.error({ err: error, intentId }, "Failed to finalize property document upload");
    res.status(500).json({ message: "Failed to finalize document upload" });
  }
}

async function downloadDocument(req: Request, res: Response, admin: boolean): Promise<void> {
  const parsed = (admin
    ? z.DownloadAdminPropertyDocumentParams
    : z.DownloadEmployeePropertyDocumentParams
  ).safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid document" });
    return;
  }
  const row = await findDocument(parsed.data.documentId);
  if (!row) {
    res.status(404).json({ message: "Document not found" });
    return;
  }
  if (!admin) {
    if (row.document.uploadedBy !== req.currentUser!.id || !(await hasActiveUploadGrant(req.currentUser!.id))) {
      res.status(403).json({ message: "Document download is not permitted" });
      return;
    }
  }
  const generation = row.document.generation;
  const [current] = await db
    .select({
      storageKey: propertyDocumentsTable.storageKey,
      generation: propertyDocumentsTable.generation,
      originalName: propertyDocumentsTable.originalName,
      contentType: propertyDocumentsTable.contentType,
    })
    .from(propertyDocumentsTable)
    .where(
      and(
        eq(propertyDocumentsTable.id, row.document.id),
        eq(propertyDocumentsTable.generation, generation),
      ),
    )
    .limit(1);
  if (!current) {
    res.status(409).json({ message: "Document changed; retry the download" });
    return;
  }
  let file;
  try {
    file = await storage.getPrivateObjectFileForKey(current.storageKey);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Document content not found" });
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  if (!metadata.generation) {
    res.status(409).json({ message: "Document content has no immutable generation" });
    return;
  }
  const metadataBytes = Number(metadata.size ?? 0);
  if (!Number.isSafeInteger(metadataBytes) || metadataBytes > MAX_BYTES) {
    res.status(413).json({ message: "Document content exceeds the 20 MiB maximum" });
    return;
  }
  let pinnedFile;
  try {
    pinnedFile = await storage.getPrivateObjectFileForKey(
      current.storageKey,
      true,
      metadata.generation,
    );
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Document content not found" });
      return;
    }
    throw error;
  }
  const [pinnedMetadata] = await pinnedFile.getMetadata();
  if (
    String(pinnedMetadata.generation) !== String(metadata.generation) ||
    Number(pinnedMetadata.size ?? 0) !== metadataBytes
  ) {
    res.status(409).json({ message: "Document content changed; retry the download" });
    return;
  }
  const [stillCurrent] = await db
    .select({ id: propertyDocumentsTable.id })
    .from(propertyDocumentsTable)
    .where(
      and(
        eq(propertyDocumentsTable.id, row.document.id),
        eq(propertyDocumentsTable.generation, generation),
        eq(propertyDocumentsTable.storageKey, current.storageKey),
      ),
    )
    .limit(1);
  if (!stillCurrent) {
    res.status(409).json({ message: "Document changed; retry the download" });
    return;
  }
  const safeName = current.originalName.replace(/[\u0000-\u001f\u007f"\\]/g, "_").slice(0, 200) || "property-document";
  res.setHeader("Content-Type", current.contentType);
  res.setHeader("Content-Length", String(metadataBytes));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  const stream = createBoundedDownloadStream(
    pinnedFile.createReadStream(),
    MAX_BYTES,
    metadataBytes,
  );
  stream.on("error", (error) => {
    req.log.error({ err: error, documentId: row.document.id }, "Property document stream failed");
    if (!res.headersSent) res.status(500).json({ message: "Failed to download document" });
    else res.destroy(error);
  });
  stream.pipe(res);
}

function createBoundedDownloadStream(
  source: ReturnType<File["createReadStream"]>,
  maxBytes: number,
  expectedBytes: number,
): Transform {
  let total = 0;
  const bounded = new Transform({
    transform(chunk, _encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        source.destroy();
        callback(new Error("Document stream exceeded the 20 MiB maximum"));
        return;
      }
      if (bytes.length > remaining) {
        if (remaining > 0) this.push(bytes.subarray(0, remaining));
        total = maxBytes;
        source.destroy();
        callback(new Error("Document stream exceeded the 20 MiB maximum"));
        return;
      }
      total += bytes.length;
      callback(null, bytes);
    },
    flush(callback) {
      if (total !== expectedBytes) {
        callback(new Error("Document stream size changed during download"));
        return;
      }
      callback();
    },
  });
  source.on("error", (error) => bounded.destroy(error));
  return bounded;
}

router.get("/admin/property-documents/properties", requirePropertyDocumentAdmin, (req, res) =>
  listProperties(req, res, true),
);
router.get("/admin/property-documents", requirePropertyDocumentAdmin, (req, res) =>
  listDocuments(req, res, true),
);
router.get("/admin/property-documents/upload-grants", requirePropertyDocumentAdmin, async (req, res) => {
  const rows = await db
    .select({ user: usersTable, grant: propertyDocumentUploadGrantsTable })
    .from(usersTable)
    .leftJoin(propertyDocumentUploadGrantsTable, eq(usersTable.id, propertyDocumentUploadGrantsTable.userId))
    .where(eq(usersTable.role, "employee"))
    .orderBy(asc(usersTable.name), asc(usersTable.email));
  res.json(
    z.ListPropertyDocumentUploadGrantsResponse.parse(
      rows.map(({ user, grant }) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
        role: "employee",
        userStatus: user.status,
        active: grant?.active ?? false,
        grantedAt: grant?.grantedAt?.toISOString() ?? null,
        revokedAt: grant?.revokedAt?.toISOString() ?? null,
      })),
    ),
  );
});
router.post("/admin/property-documents/upload-grants/:userId", requirePropertyDocumentAdmin, async (req, res) => {
  const parsed = z.GrantPropertyDocumentUploadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid employee" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, parsed.data.userId), eq(usersTable.role, "employee"))).limit(1);
  if (!user) {
    res.status(404).json({ message: "Employee user not found" });
    return;
  }
  const granter = await actorId(req);
  const [grant] = await db
    .insert(propertyDocumentUploadGrantsTable)
    .values({ userId: user.id, grantedBy: granter, active: true, revokedAt: null, revokedBy: null })
    .onConflictDoUpdate({
      target: propertyDocumentUploadGrantsTable.userId,
      set: { grantedBy: granter, active: true, grantedAt: new Date(), revokedAt: null, revokedBy: null },
    })
    .returning();
  res.json(
    z.GrantPropertyDocumentUploadResponse.parse({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: "employee",
      userStatus: user.status,
      active: grant.active,
      grantedAt: grant.grantedAt.toISOString(),
      revokedAt: null,
    }),
  );
});
router.delete("/admin/property-documents/upload-grants/:userId", requirePropertyDocumentAdmin, async (req, res) => {
  const parsed = z.RevokePropertyDocumentUploadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid employee" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, parsed.data.userId), eq(usersTable.role, "employee"))).limit(1);
  if (!user) {
    res.status(404).json({ message: "Employee user not found" });
    return;
  }
  const revoker = await actorId(req);
  const [grant] = await db
    .insert(propertyDocumentUploadGrantsTable)
    .values({ userId: user.id, grantedBy: revoker, active: false, revokedAt: new Date(), revokedBy: revoker })
    .onConflictDoUpdate({
      target: propertyDocumentUploadGrantsTable.userId,
      set: { active: false, revokedAt: new Date(), revokedBy: revoker },
    })
    .returning();
  res.json(
    z.RevokePropertyDocumentUploadResponse.parse({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: "employee",
      userStatus: user.status,
      active: grant.active,
      grantedAt: grant.grantedAt.toISOString(),
      revokedAt: grant.revokedAt?.toISOString() ?? null,
    }),
  );
});
router.post("/admin/property-documents/upload-intents", requirePropertyDocumentAdmin, (req, res) =>
  createUploadIntent(req, res, true),
);
router.put("/admin/property-documents/upload-intents/:intentId/content", requirePropertyDocumentAdmin, (req, res) =>
  uploadIntentContent(req, res, true),
);
router.post("/admin/property-documents/upload-intents/:intentId/finalize", requirePropertyDocumentAdmin, (req, res) =>
  finalizeUpload(req, res, true),
);
router.get("/admin/property-documents/:documentId/download", requirePropertyDocumentAdmin, (req, res) =>
  downloadDocument(req, res, true),
);
router.post("/admin/property-documents/:documentId/review", requirePropertyDocumentAdmin, async (req, res) => {
  const params = z.ReviewPropertyDocumentParams.safeParse(req.params);
  const body = z.ReviewPropertyDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid review" });
    return;
  }
  const reason = body.data.reason?.trim() || null;
  if (body.data.status === "rejected" && !reason) {
    res.status(400).json({ message: "A rejection reason is required" });
    return;
  }
  const reviewer = await actorId(req);
  const [updated] = await db
    .update(propertyDocumentsTable)
    .set({
      status: body.data.status,
      reviewedBy: reviewer,
      reviewedAt: new Date(),
      reviewReason: reason,
      updatedAt: new Date(),
      generation: sql`${propertyDocumentsTable.generation} + 1`,
    })
    .where(and(eq(propertyDocumentsTable.id, params.data.documentId), eq(propertyDocumentsTable.status, "pending")))
    .returning();
  if (!updated) {
    res.status(409).json({ message: "Document is not pending or does not exist" });
    return;
  }
  const row = await findDocument(updated.id);
  if (!row) {
    res.status(500).json({ message: "Reviewed document could not be loaded" });
    return;
  }
  res.json(z.ReviewPropertyDocumentResponse.parse(documentDto(row)));
});

router.get("/employee/property-documents/properties", requireActiveEmployeeUploader, (req, res) =>
  listProperties(req, res, false),
);
router.get("/employee/property-documents", requireActiveEmployee, (req, res) =>
  listDocuments(req, res, false),
);
router.post("/employee/property-documents/upload-intents", requireActiveEmployeeUploader, (req, res) =>
  createUploadIntent(req, res, false),
);
router.put("/employee/property-documents/upload-intents/:intentId/content", requireActiveEmployeeUploader, (req, res) =>
  uploadIntentContent(req, res, false),
);
router.post("/employee/property-documents/upload-intents/:intentId/finalize", requireActiveEmployeeUploader, (req, res) =>
  finalizeUpload(req, res, false),
);
router.get("/employee/property-documents/:documentId/download", requireActiveEmployeeUploader, (req, res) =>
  downloadDocument(req, res, false),
);

export default router;