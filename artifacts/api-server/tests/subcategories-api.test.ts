import { expect, test } from "vitest";
import { db, pool, propertyCategoriesTable, propertiesTable, roomsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { HOTEL_SUBCATEGORIES, isValidSubcategorySelection } from "../src/lib/subcategories";

test("hotel defaults and category membership are exact", () => {
  expect(HOTEL_SUBCATEGORIES).toHaveLength(10);
  expect(isValidSubcategorySelection(["Luxury Hotel", "5-Star Hotel"], HOTEL_SUBCATEGORIES)).toBe(true);
  expect(isValidSubcategorySelection(["Unknown"], HOTEL_SUBCATEGORIES)).toBe(false);
  expect(isValidSubcategorySelection(["Luxury Hotel", "Luxury Hotel"], HOTEL_SUBCATEGORIES)).toBe(false);
});

test.skipIf(process.env.RUN_SUBCATEGORY_API_TEST !== "1")("catalog, room and property persistence, filtering and removal protection", async () => {
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
  let token = "";
  let categoryId: number | undefined;
  let propertyId: number | undefined;
  let roomId: number | undefined;
  const call = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const auth = await call("/admin/login", "POST", { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    expect(auth.status).toBe(200); token = auth.data.token;
    const slug = `subcategory-fixture-${Date.now()}`;
    const category = { name: slug, slug, active: true, sortOrder: 99, subcategories: ["Fixture Luxury", "Fixture Budget"] };
    const created = await call("/admin/property-categories", "POST", category);
    expect(created.status).toBe(201); categoryId = created.data.id;
    expect((await call("/property-categories")).data.find((row: { id: number }) => row.id === categoryId).subcategories).toEqual(category.subcategories);
    const [source] = await db.select().from(propertiesTable).where(and(isNotNull(propertiesTable.country), isNotNull(propertiesTable.state))).limit(1);
    expect(source).toBeDefined();
    const { id, propertyNumber, createdAt, updatedAt, ...fields } = source;
    const [fixture] = await db.insert(propertiesTable).values({
      ...fields, name: slug, category: slug, subcategories: [], ownerId: null, contactPhone: null, contactEmail: null, status: "active",
    }).returning();
    propertyId = fixture.id;
    const room = { propertyId, name: "Fixture room", description: "Test room", imageUrl: fixture.imageUrl, pricePerNight: 100, maxGuests: 2, totalRooms: 1, subcategories: ["Fixture Luxury"] };
    const roomResult = await call("/admin/rooms", "POST", room);
    expect(roomResult.status).toBe(201); roomId = roomResult.data.id;
    expect((await call(`/properties/${propertyId}`)).data.rooms.find((item: { id: number }) => item.id === roomId).subcategories).toEqual(room.subcategories);
    const query = `/properties?category=${slug}&subcategory=`;
    expect((await call(query + "Fixture%20Luxury")).data.map((item: { id: number }) => item.id)).toContain(propertyId);
    expect((await call(query + "Fixture%20Budget")).data).toHaveLength(0);
    expect((await call(`/admin/rooms/${roomId}`, "PUT", { ...room, subcategories: ["Wrong category"] })).status).toBe(400);
    expect((await call(`/admin/property-categories/${categoryId}`, "PUT", { ...category, subcategories: [] })).status).toBe(409);
    expect((await call(`/admin/rooms/${roomId}`, "PUT", { ...room, subcategories: [] })).status).toBe(200);
    expect((await call(query + "Fixture%20Luxury")).data).toHaveLength(0);
    expect((await call(`/admin/properties/${propertyId}`, "PUT", { ...fixture, subcategories: ["Fixture Budget"] })).status).toBe(200);
    expect((await call(query + "Fixture%20Budget")).data.map((item: { id: number }) => item.id)).toContain(propertyId);
    expect((await call(`/properties/${propertyId}`)).data.subcategories).toEqual(["Fixture Budget"]);
    expect((await call(`/admin/properties/${propertyId}`, "PUT", { ...fixture, subcategories: [] })).status).toBe(200);
    expect((await call(`/admin/property-categories/${categoryId}`, "PUT", { ...category, subcategories: [] })).status).toBe(200);
    token = "";
    expect((await call("/agent/rooms", "POST", room)).status).toBe(401);
    expect((await call("/partner/rooms", "POST", room)).status).toBe(401);
  } finally {
    if (roomId) await db.delete(roomsTable).where(eq(roomsTable.id, roomId));
    if (propertyId) await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
    if (categoryId) await db.delete(propertyCategoriesTable).where(eq(propertyCategoriesTable.id, categoryId));
    await pool.end();
  }
}, 60000);
