import { expect, test } from "vitest";
import { db, pool, amenityCategoriesTable, amenitiesTable, propertiesTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";

// Explicit opt-in: creates and cleans up isolated DEVELOPMENT fixtures only.
test.skipIf(process.env.RUN_AMENITY_API_TEST !== "1")("amenity catalog and property persistence", async () => {
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
  let token = "";
  let categoryId: number | undefined;
  let propertyId: number | undefined;
  const call = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const auth = await call("/admin/login", "POST", { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    expect(auth.status).toBe(200);
    token = auth.data.token;
    const label = `Amenity smoke ${Date.now()}`;
    const created = await call("/admin/amenity-categories", "POST", { name: label });
    expect(created.status).toBe(201);
    categoryId = created.data.categories.find((c: { name: string }) => c.name === label).id;
    expect((await call("/admin/amenity-categories", "POST", { name: label })).status).toBe(409);
    expect((await call("/admin/amenities", "POST", { categoryId, name: "Fixture amenity", icon: "check" })).status).toBe(201);
    expect((await call("/admin/amenities", "POST", { categoryId, name: "Fixture amenity", icon: "check" })).status).toBe(409);
    expect((await call("/admin/amenities", "POST", { categoryId, name: "Bad icon", icon: "invalid" })).status).toBe(400);
    const [source] = await db.select().from(propertiesTable).where(and(isNotNull(propertiesTable.country), isNotNull(propertiesTable.state))).limit(1);
    expect(source).toBeDefined();
    const { id, propertyNumber, createdAt, updatedAt, ...fields } = source;
    const [fixture] = await db.insert(propertiesTable).values({
      ...fields, name: label, ownerId: null, contactPhone: null, contactEmail: null,
      amenities: ["Legacy amenity"], status: "active",
    }).returning();
    propertyId = fixture.id;
    const selected = ["Wi-Fi", "Private Pool", "Fixture amenity", "Legacy amenity"];
    expect((await call(`/admin/properties/${propertyId}`, "PUT", { ...fixture, amenities: selected })).status).toBe(200);
    expect((await call(`/properties/${propertyId}`)).data.amenities).toEqual(selected);
    const beforeDelete = await call("/amenity-catalog");
    const option = beforeDelete.data.categories.find((c: { id: number }) => c.id === categoryId).amenities[0];
    const removed = await call(`/admin/amenities/${option.id}`, "DELETE");
    expect(removed.status).toBe(200);
    expect(removed.data.categories.find((c: { id: number }) => c.id === categoryId).amenities).toHaveLength(0);
    expect((await call(`/properties/${propertyId}`)).data.amenities).toEqual(selected);
    expect((await call(`/admin/amenities/${option.id}`, "DELETE")).status).toBe(200);
    expect((await call("/admin/amenities", "POST", { categoryId, name: "Fixture amenity", icon: "check" })).status).toBe(201);
    expect((await call("/amenity-catalog")).data.categories.find((c: { id: number }) => c.id === categoryId).amenities).toHaveLength(1);
    expect((await call(`/admin/properties/${propertyId}`, "PUT", { ...fixture, amenities: ["Legacy amenity"] })).status).toBe(200);
    expect((await call(`/properties/${propertyId}`)).data.amenities).toEqual(["Legacy amenity"]);
  } finally {
    if (propertyId) await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
    if (categoryId) {
      await db.delete(amenitiesTable).where(eq(amenitiesTable.categoryId, categoryId));
      await db.delete(amenityCategoriesTable).where(eq(amenityCategoriesTable.id, categoryId));
    }
    await pool.end();
  }
}, 60_000);
