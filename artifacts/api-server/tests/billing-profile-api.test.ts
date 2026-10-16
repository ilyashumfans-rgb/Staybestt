import { test, expect } from "vitest";
import { db, pool, billingSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { readCompanyLogo } from "../src/lib/invoicePdf";

// Explicit development-only opt-in. Restore the original profile even on failure.
test.skipIf(process.env.RUN_BILLING_PROFILE_TEST !== "1")("company profile, uploaded logo, validation and persistence", async () => {
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
  const [original] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
  let token = "";
  let objectPath = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    expect((await call("/admin/billing-settings", "PUT", {})).status).toBe(401);
    const auth = await call("/admin/login", "POST", { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    expect(auth.status).toBe(200);
    token = auth.data.token;
    const png = await sharp({ create: { width: 160, height: 48, channels: 4, background: "#ff8800" } }).png().toBuffer();
    const upload = await call("/storage/uploads/request-url", "POST", { name: "profile-test.png", contentType: "image/png", size: png.length });
    expect(upload.status).toBe(200);
    objectPath = upload.data.objectPath;
    expect((await fetch(upload.data.uploadURL, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png })).ok).toBe(true);
    const profile = { businessName: "Profile verification", address: "Test company address", taxRegistration: "29ABCDE1234F1Z5", email: "billing@example.com", phone: "+91 9000000000", logoUrl: `/api/storage${objectPath}` };
    expect((await call("/admin/billing-settings", "PUT", profile)).status).toBe(200);
    expect((await call("/admin/billing-settings")).data).toMatchObject(profile);
    expect((await readCompanyLogo(profile.logoUrl)).equals(png)).toBe(true);
    expect((await call("/admin/billing-settings", "PUT", { ...profile, email: "bad-address" })).status).toBe(400);
    expect((await call("/admin/billing-settings", "PUT", { ...profile, logoUrl: "http://localhost/private" })).status).toBe(400);
    expect((await call("/admin/billing-settings")).data).toMatchObject(profile);
    expect((await call("/admin/billing-settings", "PUT", { ...profile, logoUrl: null, email: null, phone: null })).status).toBe(200);
    expect((await call("/admin/billing-settings")).data).toMatchObject({ logoUrl: null, email: null, phone: null });
  } finally {
    try {
      if (original) await db.insert(billingSettingsTable).values(original).onConflictDoUpdate({ target: billingSettingsTable.id, set: original });
      else await db.delete(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
      if (objectPath) await (await new ObjectStorageService().getObjectEntityFile(objectPath)).delete();
    } finally { await pool.end(); }
  }
}, 60000);
