import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, reviewsTable, propertiesTable } from "@workspace/db";
import {
  GetPropertyReviewsParams,
  GetPropertyReviewsResponse,
  CreateReviewParams,
  CreateReviewBody,
  CreateReviewResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function toReviewDto(r: typeof reviewsTable.$inferSelect) {
  return {
    id: r.id,
    propertyId: r.propertyId,
    guestName: r.guestName,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/properties/:id/reviews", async (req, res): Promise<void> => {
  const params = GetPropertyReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.propertyId, params.data.id))
    .orderBy(desc(reviewsTable.createdAt));

  res.json(GetPropertyReviewsResponse.parse(rows.map(toReviewDto)));
});

router.post("/properties/:id/reviews", async (req, res): Promise<void> => {
  const params = CreateReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = CreateReviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  if (!property) {
    res.status(400).json({ message: "Property not found" });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({
      propertyId: params.data.id,
      guestName: body.data.guestName,
      rating: body.data.rating,
      comment: body.data.comment,
    })
    .returning();

  // Keep aggregate rating in sync
  await db
    .update(propertiesTable)
    .set({
      reviewCount: sql`(SELECT count(*) FROM reviews WHERE property_id = ${params.data.id})::int`,
      rating: sql`(SELECT round(avg(rating)::numeric, 1) FROM reviews WHERE property_id = ${params.data.id})::float`,
    })
    .where(eq(propertiesTable.id, params.data.id));

  res.status(201).json(CreateReviewResponse.parse(toReviewDto(review!)));
});

export default router;
