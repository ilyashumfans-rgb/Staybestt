import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, propertiesTable, propertyCategoriesTable } from "@workspace/db";
import {
  CreatePropertyCategoryBody,
  CreatePropertyCategoryResponse,
  DeletePropertyCategoryParams,
  DeletePropertyCategoryResponse,
  ListAdminPropertyCategoriesResponse,
  ListPropertyCategoriesResponse,
  UpdatePropertyCategoryBody,
  UpdatePropertyCategoryParams,
  UpdatePropertyCategoryResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "./admin";

const router: IRouter = Router();

async function listCategories(includeInactive: boolean) {
  return db
    .select()
    .from(propertyCategoriesTable)
    .where(includeInactive ? undefined : eq(propertyCategoriesTable.active, true))
    .orderBy(
      asc(propertyCategoriesTable.sortOrder),
      asc(propertyCategoriesTable.name),
    );
}

router.get("/property-categories", async (_req, res): Promise<void> => {
  res.json(ListPropertyCategoriesResponse.parse(await listCategories(false)));
});

router.use("/admin/property-categories", requireAdmin);

router.get("/admin/property-categories", async (_req, res): Promise<void> => {
  res.json(
    ListAdminPropertyCategoriesResponse.parse(await listCategories(true)),
  );
});

router.post("/admin/property-categories", async (req, res): Promise<void> => {
  const parsed = CreatePropertyCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid name and lowercase slug" });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ message: "Category name is required" });
    return;
  }
  try {
    const [created] = await db
      .insert(propertyCategoriesTable)
      .values({ ...parsed.data, name })
      .returning();
    res.status(201).json(CreatePropertyCategoryResponse.parse(created!));
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "23505") {
      res.status(409).json({ message: "A category with this slug already exists" });
      return;
    }
    throw error;
  }
});

router.put("/admin/property-categories/:id", async (req, res): Promise<void> => {
  const params = UpdatePropertyCategoryParams.safeParse(req.params);
  const body = UpdatePropertyCategoryBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data.name.trim()) {
    res.status(400).json({ message: "Enter a valid category" });
    return;
  }
  const [existing] = await db
    .select()
    .from(propertyCategoriesTable)
    .where(eq(propertyCategoriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ message: "Property category not found" });
    return;
  }
  if (existing.slug !== body.data.slug) {
    const [property] = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(eq(propertiesTable.category, existing.slug))
      .limit(1);
    if (property) {
      res.status(409).json({
        message: "This category is in use. Its slug cannot be changed; rename its display name instead.",
      });
      return;
    }
  }
  try {
    const [updated] = await db
      .update(propertyCategoriesTable)
      .set({ ...body.data, name: body.data.name.trim(), updatedAt: new Date() })
      .where(eq(propertyCategoriesTable.id, params.data.id))
      .returning();
    res.json(UpdatePropertyCategoryResponse.parse(updated!));
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "23505") {
      res.status(409).json({ message: "A category with this slug already exists" });
      return;
    }
    throw error;
  }
});

router.delete("/admin/property-categories/:id", async (req, res): Promise<void> => {
  const params = DeletePropertyCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const [category] = await db
    .select()
    .from(propertyCategoriesTable)
    .where(eq(propertyCategoriesTable.id, params.data.id));
  if (!category) {
    res.status(404).json({ message: "Property category not found" });
    return;
  }
  const [property] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.category, category.slug))
    .limit(1);
  if (property) {
    res.status(409).json({
      message: "This category is in use by one or more properties and cannot be deleted. Deactivate it instead.",
    });
    return;
  }
  await db
    .delete(propertyCategoriesTable)
    .where(eq(propertyCategoriesTable.id, category.id));
  res.json(
    DeletePropertyCategoryResponse.parse({ message: "Property category deleted" }),
  );
});

export default router;