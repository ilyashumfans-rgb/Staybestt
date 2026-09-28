import { Router, type IRouter } from "express";
import { and, eq, desc, or } from "drizzle-orm";
import { db, wishlistTable, propertiesTable } from "@workspace/db";
import {
  GetWishlistQueryParams,
  GetWishlistResponse,
  AddToWishlistBody,
  RemoveFromWishlistQueryParams,
} from "@workspace/api-zod";
import { toPropertySummary } from "../lib/mappers";
import { resolveUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/wishlist", async (req, res): Promise<void> => {
  const parsed = GetWishlistQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const authUser = await resolveUser(req);
  const email = authUser?.email ?? parsed.data.email;
  if (!email) {
    res.status(400).json({ message: "Sign in or provide an email" });
    return;
  }

  const rows = await db
    .select()
    .from(wishlistTable)
    .innerJoin(
      propertiesTable,
      eq(wishlistTable.propertyId, propertiesTable.id),
    )
    .where(
      authUser
        ? or(
            eq(wishlistTable.userId, authUser.id),
            eq(wishlistTable.email, email.toLowerCase()),
          )
        : eq(wishlistTable.email, email.toLowerCase()),
    )
    .orderBy(desc(wishlistTable.createdAt));

  res.json(
    GetWishlistResponse.parse(rows.map((r) => toPropertySummary(r.properties))),
  );
});

router.post("/wishlist", async (req, res): Promise<void> => {
  const parsed = AddToWishlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const authUser = await resolveUser(req);
  await db
    .insert(wishlistTable)
    .values({
      email: (authUser?.email ?? parsed.data.email).toLowerCase(),
      userId: authUser?.id ?? null,
      propertyId: parsed.data.propertyId,
    })
    .onConflictDoNothing();

  res.status(201).json({ message: "Added to wishlist" });
});

router.delete("/wishlist/remove", async (req, res): Promise<void> => {
  const parsed = RemoveFromWishlistQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const authUser = await resolveUser(req);
  const email = authUser?.email ?? parsed.data.email;
  if (!email) {
    res.status(400).json({ message: "Sign in or provide an email" });
    return;
  }
  await db
    .delete(wishlistTable)
    .where(
      and(
        authUser
          ? or(
              eq(wishlistTable.userId, authUser.id),
              eq(wishlistTable.email, email.toLowerCase()),
            )
          : eq(wishlistTable.email, email.toLowerCase()),
        eq(wishlistTable.propertyId, parsed.data.propertyId),
      ),
    );

  res.json({ message: "Removed from wishlist" });
});

export default router;
