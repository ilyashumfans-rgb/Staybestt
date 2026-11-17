import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, amenitiesTable, amenityCategoriesTable } from "@workspace/db";
import { CreateAmenityBody, CreateAmenityCategoryBody, DeleteAmenityParams } from "@workspace/api-zod";
import { requireAdmin } from "./admin";

const router = Router();
const defaults = [
  { name: "USP & Amenities", items: [["Private Pool", "pool"], ["Lawn", "lawn"], ["Breakfast Included", "breakfast"], ["WiFi", "wifi"], ["Home Theatre", "theatre"]] },
  { name: "Experiences", items: [["BBQ", "bbq"], ["Private Pool", "pool"], ["Bonfire", "bonfire"], ["Lawn", "lawn"], ["Gazebo", "gazebo"], ["Indoor/Outdoor Games", "games"], ["Bar", "bar"]] },
  { name: "Living Room", items: [["TV", "tv"], ["Music System/Speaker", "music"]] },
  { name: "Common Amenities", items: [["Balcony/Terrace", "balcony"], ["Wi-Fi", "wifi"], ["AC", "ac"]] },
  { name: "Kitchen", items: [["Refrigerator", "refrigerator"], ["Water Purifier", "water"]] },
  { name: "Preferences", items: [["Free Cancellation", "check"], ["Breakfast Included", "breakfast"], ["Pay at Property", "check"], ["Couple Friendly", "check"], ["Family Friendly", "check"], ["Pet Friendly", "check"]] },
];

let seedPromise: Promise<void> | undefined;
function ensureDefaults() {
  if (!seedPromise) {
    seedPromise = db.transaction(async tx => {
      for (const [sortOrder, group] of defaults.entries()) {
        await tx.insert(amenityCategoriesTable).values({ name: group.name, sortOrder }).onConflictDoNothing();
        const [category] = await tx.select().from(amenityCategoriesTable).where(eq(amenityCategoriesTable.name, group.name));
        await tx.insert(amenitiesTable).values(group.items.map(([name, icon]) => ({
          categoryId: category.id, name, icon,
        }))).onConflictDoNothing();
      }
    }).catch(error => { seedPromise = undefined; throw error; });
  }
  return seedPromise;
}

async function catalog() {
  await ensureDefaults();
  const categories = await db.select().from(amenityCategoriesTable).orderBy(asc(amenityCategoriesTable.sortOrder), asc(amenityCategoriesTable.id));
  const amenities = await db.select().from(amenitiesTable).where(eq(amenitiesTable.archived, false)).orderBy(asc(amenitiesTable.id));
  return { categories: categories.map(category => ({
    id: category.id, name: category.name,
    amenities: amenities.filter(item => item.categoryId === category.id).map(({ id, name, icon }) => ({ id, name, icon })),
  })) };
}

router.get("/amenity-catalog", async (_req, res) => {
  res.json(await catalog());
});

router.post("/admin/amenity-categories", requireAdmin, async (req, res) => {
  const body = CreateAmenityCategoryBody.safeParse(req.body);
  const name = body.success ? body.data.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.includes(",")) {
    res.status(400).json({ message: "Enter a category name without commas." }); return;
  }
  await ensureDefaults();
  try {
    // Database uniqueness remains the final guard against concurrent requests.
    const existing = await db.select().from(amenityCategoriesTable).where(sql`lower(${amenityCategoriesTable.name}) = lower(${name})`);
    if (existing.length) { res.status(409).json({ message: "Category already exists." }); return; }
    await db.insert(amenityCategoriesTable).values({ name });
    res.status(201).json(await catalog());
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "23505") {
      res.status(409).json({ message: "Category already exists." }); return;
    }
    throw error;
  }
});

router.post("/admin/amenities", requireAdmin, async (req, res) => {
  const body = CreateAmenityBody.safeParse(req.body);
  const name = body.success ? body.data.name.trim().replace(/\s+/g, " ") : "";
  if (!body.success || !name || name.includes(",")) {
    res.status(400).json({ message: "Choose a category and icon, and enter an amenity name without commas." }); return;
  }
  await ensureDefaults();
  const [category] = await db.select().from(amenityCategoriesTable).where(eq(amenityCategoriesTable.id, body.data.categoryId));
  if (!category) { res.status(404).json({ message: "Category not found." }); return; }
  const existing = await db.select().from(amenitiesTable).where(eq(amenitiesTable.categoryId, category.id));
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = existing.find(item => normalize(item.name) === normalize(name));
  if (match?.archived) {
    await db.update(amenitiesTable).set({ archived: false, icon: body.data.icon }).where(eq(amenitiesTable.id, match.id));
    res.status(201).json(await catalog()); return;
  }
  if (match) {
    res.status(409).json({ message: "This amenity already exists in this category." }); return;
  }
  try {
    await db.insert(amenitiesTable).values({ ...body.data, name });
    res.status(201).json(await catalog());
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "23505") {
      res.status(409).json({ message: "This amenity already exists in this category." }); return;
    }
    throw error;
  }
});

router.delete("/admin/amenities/:id", requireAdmin, async (req, res) => {
  const params = DeleteAmenityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Invalid amenity id." }); return; }
  // Keep the row so default seeding cannot recreate deleted options on restart.
  // Property/room selections are deliberately not changed by catalog deletion.
  const [item] = await db.update(amenitiesTable).set({ archived: true })
    .where(eq(amenitiesTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ message: "Amenity not found." }); return; }
  res.json(await catalog());
});

export default router;
