import { getAuth } from "@clerk/express";
import { createHash } from "node:crypto";
import { db, propertiesTable } from "@workspace/db";
import {
  GetTravelAssistantRecommendationsBody,
  GetTravelAssistantRecommendationsResponse,
} from "@workspace/api-zod";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { toPropertySummary } from "../lib/mappers";

const router: IRouter = Router();
const DAILY_LIMIT = 15;

function getUsageKey(req: Parameters<typeof getAuth>[0]) {
  const userId = getAuth(req).userId;
  const rawKey = userId ? `user:${userId}` : `ip:${req.ip ?? "unknown"}`;
  return createHash("sha256").update(rawKey).digest("hex");
}

async function consumeRequest(keyHash: string) {
  const day = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    INSERT INTO assistant_daily_usage (key_hash, usage_date, request_count)
    VALUES (${keyHash}, ${day}, 1)
    ON CONFLICT (key_hash, usage_date)
    DO UPDATE SET request_count = assistant_daily_usage.request_count + 1
    WHERE assistant_daily_usage.request_count < ${DAILY_LIMIT}
    RETURNING request_count
  `);
  const row = result.rows[0] as { request_count: number } | undefined;
  return row ? DAILY_LIMIT - row.request_count : -1;
}

function extractBudget(text: string) {
  const match = text.match(
    /(?:under|below|upto|up to|max(?:imum)?|budget(?:\s+of)?)[^\d]{0,12}(?:₹|rs\.?|inr)?\s*([\d,]+)/i,
  );
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchUrl(
  destination: string,
  budget: number | null,
  category: string | null,
) {
  const params = new URLSearchParams({ q: destination });
  if (budget != null) params.set("maxPrice", String(budget));
  if (category) params.set("category", category);
  return `/search?${params.toString()}`;
}

router.post(
  "/assistant/recommendations",
  async (req, res): Promise<void> => {
    const parsed = GetTravelAssistantRecommendationsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }

    const remainingRequests = await consumeRequest(getUsageKey(req));
    if (remainingRequests < 0) {
      res.status(429).json({
        message:
          "You have reached today's travel assistant limit. You can still browse and filter every StayBest property.",
      });
      return;
    }

    const activeProperties = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.status, "active"));

    const userTurns = [
      ...(parsed.data.history ?? [])
        .filter((message) => message.role === "user")
        .map((message) => message.content.toLowerCase()),
      parsed.data.message.toLowerCase(),
    ];

    const locations = Array.from(
      new Set(
        activeProperties.flatMap((property) => [
          property.city,
          property.area,
          property.landmark ?? "",
        ]),
      ),
    )
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    let destination: string | null = null;
    let budget: number | null = null;
    let category: string | null = null;
    let budgetIntent = false;
    let familyIntent = false;
    let cancellationIntent = false;
    const requestedAmenities = new Set<string>();
    const amenityNames = [
      "pool",
      "wifi",
      "breakfast",
      "spa",
      "beach",
      "parking",
      "gym",
      "restaurant",
    ];

    for (const turn of userTurns) {
      const mentionedLocations = locations.filter((location) =>
        turn.includes(location.toLowerCase()),
      );
      const rejectedLocations = mentionedLocations.filter((location) =>
        new RegExp(
          `\\b(?:not|no|avoid|without)\\s+(?:(?:going|staying)\\s+to\\s+|(?:in|near)\\s+)?${escapeRegex(location)}\\b`,
          "i",
        ).test(turn),
      );
      const acceptedLocation = mentionedLocations.find(
        (location) => !rejectedLocations.includes(location),
      );
      if (acceptedLocation) {
        destination = acceptedLocation;
      } else if (
        destination &&
        rejectedLocations.some(
          (location) => location.toLowerCase() === destination?.toLowerCase(),
        )
      ) {
        destination = null;
      }

      if (/\b(?:not|no longer)\s+(?:under|below|up to|max(?:imum)?)\b/i.test(turn)) {
        budget = null;
      } else {
        const turnBudget = extractBudget(turn);
        if (turnBudget != null) budget = turnBudget;
      }

      for (const value of ["luxury", "prime", "package"]) {
        if (new RegExp(`\\b(?:not|no|avoid)\\s+${value}\\b`, "i").test(turn)) {
          if (category === value) category = null;
        } else if (new RegExp(`\\b${value}\\b`, "i").test(turn)) {
          category = value;
        }
      }

      if (/\b(?:not|no|avoid)\s+(?:a\s+)?(?:budget|affordable|cheap|value)\b/i.test(turn)) {
        budgetIntent = false;
      } else if (/\b(budget|affordable|cheap|value)\b/i.test(turn)) {
        budgetIntent = true;
      }

      if (/\b(?:adults?\s+only|no\s+(?:kids?|children)|not\s+family)\b/i.test(turn)) {
        familyIntent = false;
      } else if (/\b(family|kids?|children|child)\b/i.test(turn)) {
        familyIntent = true;
      }

      if (/\b(?:no|without|not)\s+(?:free\s+)?cancell?ation\b/i.test(turn)) {
        cancellationIntent = false;
      } else if (/\b(?:free\s+)?cancell?ation\b/i.test(turn)) {
        cancellationIntent = true;
      }

      for (const amenity of amenityNames) {
        if (
          new RegExp(
            `\\b(?:no|without|not|avoid)\\s+(?:a\\s+)?${amenity}\\b`,
            "i",
          ).test(turn)
        ) {
          requestedAmenities.delete(amenity);
        } else if (turn.includes(amenity)) {
          requestedAmenities.add(amenity);
        }
      }
    }

    if (!destination) {
      res.json(
        GetTravelAssistantRecommendationsResponse.parse({
          reply:
            "I can match you with stays from StayBest's live collection. Which city or area would you like to visit?",
          needsFollowUp: true,
          followUpQuestion: "Which city or area would you like to visit?",
          recommendations: [],
          searchUrl: null,
          remainingRequests,
          model: "staybest-intent-v1",
        }),
      );
      return;
    }


    const locationNeedle = destination.toLowerCase();
    const ranked = activeProperties
      .filter((property) =>
        [property.city, property.area, property.landmark ?? ""].some(
          (value) => value.toLowerCase() === locationNeedle,
        ),
      )
      .filter((property) => budget == null || property.startingPrice <= budget)
      .filter(
        (property) =>
          category == null || property.category.toLowerCase() === category,
      )
      .map((property) => {
        const amenities = property.amenities.map((value) => value.toLowerCase());
        let score = property.rating * 10 + Math.log1p(property.reviewCount);
        if (budgetIntent) score -= property.startingPrice / 1_000;
        score += Array.from(requestedAmenities).filter((wanted) =>
          amenities.some((available) => available.includes(wanted)),
        ).length * 12;
        if (
          familyIntent &&
          amenities.some((value) =>
            /family|kids|play|pool|babysit/.test(value),
          )
        ) {
          score += 15;
        }
        if (property.breakfastIncluded && requestedAmenities.has("breakfast"))
          score += 10;
        if (property.freeCancellation && cancellationIntent)
          score += 10;
        return { property, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ property }) => toPropertySummary(property));

    const searchUrl = buildSearchUrl(destination, budget, category);
    const reply =
      ranked.length > 0
        ? `I found ${ranked.length} StayBest ${ranked.length === 1 ? "stay" : "stays"} in ${destination} that best fit your request.`
        : `I couldn't find an active StayBest property in ${destination}${budget ? ` under ₹${budget.toLocaleString("en-IN")} per night` : ""}. Try widening your budget or browse all nearby results.`;

    res.json(
      GetTravelAssistantRecommendationsResponse.parse({
        reply,
        needsFollowUp: false,
        followUpQuestion: null,
        recommendations: ranked,
        searchUrl,
        remainingRequests,
        model: "staybest-intent-v1",
      }),
    );
  },
);

export default router;