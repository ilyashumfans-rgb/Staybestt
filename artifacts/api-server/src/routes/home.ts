import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, propertiesTable, offersTable, promoBannersTable } from "@workspace/db";
import { GetHomeDataResponse } from "@workspace/api-zod";
import { toPropertySummary } from "../lib/mappers";
import { resolveUser } from "../lib/auth";

const router: IRouter = Router();

const BUDGET_BOUNDS: Record<string, { min?: number; max?: number }> = {
  "under-3000": { max: 3000 },
  "3000-8000": { min: 3000, max: 8000 },
  "8000-15000": { min: 8000, max: 15000 },
  "above-15000": { min: 15000 },
};

async function getRecommendations(
  preferences: Record<string, unknown>,
): Promise<(typeof propertiesTable.$inferSelect)[]> {
  const categories = Array.isArray(preferences.preferredCategories)
    ? (preferences.preferredCategories as unknown[]).filter(
        (c): c is string => typeof c === "string",
      )
    : [];
  const budget =
    typeof preferences.budgetRange === "string"
      ? BUDGET_BOUNDS[preferences.budgetRange]
      : undefined;

  const conditions: SQL[] = [];
  if (categories.length > 0) {
    conditions.push(inArray(propertiesTable.category, categories));
  }
  if (budget?.min !== undefined) {
    conditions.push(gte(propertiesTable.startingPrice, budget.min));
  }
  if (budget?.max !== undefined) {
    conditions.push(lte(propertiesTable.startingPrice, budget.max));
  }
  // No usable preferences saved — no personalized section.
  if (conditions.length === 0) return [];

  conditions.push(eq(propertiesTable.status, "active"));

  return db
    .select()
    .from(propertiesTable)
    .where(and(...conditions))
    .orderBy(
      desc(propertiesTable.rating),
      desc(propertiesTable.popularityScore),
    )
    .limit(8);
}

router.get("/home", async (req, res): Promise<void> => {
  const user = await resolveUser(req).catch(() => null);
  const now = new Date();
  const [featured, featuredForCities, popular, topRated, cityRows, offers, banners, recommended] =
    await Promise.all([
      db
        .select()
        .from(propertiesTable)
        .where(
          and(
            eq(propertiesTable.featured, true),
            eq(propertiesTable.status, "active"),
          ),
        )
        .orderBy(desc(propertiesTable.rating))
        .limit(8),
      db
        .select()
        .from(propertiesTable)
        .where(
          and(
            eq(propertiesTable.featured, true),
            eq(propertiesTable.status, "active"),
          ),
        )
        .orderBy(propertiesTable.city, desc(propertiesTable.rating)),
      db
        .select()
        .from(propertiesTable)
        .where(eq(propertiesTable.status, "active"))
        .orderBy(desc(propertiesTable.popularityScore))
        .limit(8),
      db
        .select()
        .from(propertiesTable)
        .where(eq(propertiesTable.status, "active"))
        .orderBy(desc(propertiesTable.rating))
        .limit(8),
      db
        .select({
          city: propertiesTable.city,
          propertyCount: sql<number>`count(*)::int`,
          imageUrl: sql<string>`min(${propertiesTable.imageUrl})`,
        })
        .from(propertiesTable)
        .where(eq(propertiesTable.status, "active"))
        .groupBy(propertiesTable.city)
        .orderBy(desc(sql`count(*)`)),
      db.select().from(offersTable).where(eq(offersTable.active, true)),
      db
        .select()
        .from(promoBannersTable)
        .where(
          and(
            eq(promoBannersTable.active, true),
            eq(promoBannersTable.placement, "home"),
            or(eq(promoBannersTable.audience, "all"), eq(promoBannersTable.audience, user?.role ?? "customer")),
            or(isNull(promoBannersTable.startsAt), lte(promoBannersTable.startsAt, now)),
            or(isNull(promoBannersTable.endsAt), gte(promoBannersTable.endsAt, now)),
          ),
        )
        .orderBy(asc(promoBannersTable.sortOrder), desc(promoBannersTable.id)),
      user ? getRecommendations(user.preferences ?? {}) : Promise.resolve([]),
    ]);
  const featuredByCity = [...new Set(featuredForCities.map((property) => property.city))]
    .map((city) => ({
      city,
      properties: featuredForCities
        .filter((property) => property.city === city)
        .slice(0, 8)
        .map(toPropertySummary),
    }));

  res.json(
    GetHomeDataResponse.parse({
      featured: featured.map(toPropertySummary),
      featuredByCity,
      banners: banners.map((banner) => ({
        ...banner,
        startsAt: banner.startsAt?.toISOString() ?? null,
        endsAt: banner.endsAt?.toISOString() ?? null,
        createdAt: banner.createdAt.toISOString(),
        updatedAt: banner.updatedAt.toISOString(),
      })),
      popular: popular.map(toPropertySummary),
      topRated: topRated.map(toPropertySummary),
      cities: cityRows,
      offers: offers.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        couponCode: o.couponCode,
        discountPercent: o.discountPercent,
      })),
      recommended: recommended.map(toPropertySummary),
    }),
  );
});

export default router;
