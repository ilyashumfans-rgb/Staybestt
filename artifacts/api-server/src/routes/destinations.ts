import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  destinationsTable,
  locationsTable,
  propertiesTable,
} from "@workspace/db";
import {
  CreateDestinationBody,
  CreateDestinationResponse,
  DeleteDestinationParams,
  DeleteDestinationResponse,
  ListAdminDestinationsResponse,
  ListDestinationsResponse,
  UpdateDestinationBody,
  UpdateDestinationParams,
  UpdateDestinationResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "./admin";
import { destinationExistsInCatalog } from "../lib/locationCatalog";

const router: IRouter = Router();

async function withCounts(includeInactive: boolean) {
  const [destinations, locations, properties] = await Promise.all([
    db
      .select()
      .from(destinationsTable)
      .where(includeInactive ? undefined : eq(destinationsTable.active, true))
      .orderBy(asc(destinationsTable.sortOrder), asc(destinationsTable.title)),
    db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.approved, true)),
    db
      .select({
        country: propertiesTable.country,
        state: propertiesTable.state,
        city: propertiesTable.city,
        area: propertiesTable.area,
        pincode: propertiesTable.pincode,
      })
      .from(propertiesTable)
      .where(eq(propertiesTable.status, "active")),
  ]);

  return destinations.map((destination) => {
    return {
      ...destination,
      propertyCount: properties.filter((property) => {
        if (property.country || property.state) {
          return (
            property.country?.toLowerCase() === destination.country.toLowerCase() &&
            (!destination.state ||
              property.state?.toLowerCase() === destination.state.toLowerCase()) &&
            (!destination.city ||
              property.city.toLowerCase() === destination.city.toLowerCase())
          );
        }
        return locations.some(
          (location) =>
            location.country.toLowerCase() === destination.country.toLowerCase() &&
            (!destination.state ||
              location.state.toLowerCase() === destination.state.toLowerCase()) &&
            (!destination.city ||
              location.city.toLowerCase() === destination.city.toLowerCase()) &&
            location.city.toLowerCase() === property.city.toLowerCase() &&
            location.area.toLowerCase() === property.area.toLowerCase() &&
            (!property.pincode || location.pincode === property.pincode),
        );
      }).length,
    };
  });
}

router.get("/destinations", async (_req, res): Promise<void> => {
  res.json(ListDestinationsResponse.parse(await withCounts(false)));
});

router.use("/admin/destinations", requireAdmin);

router.get("/admin/destinations", async (_req, res): Promise<void> => {
  res.json(ListAdminDestinationsResponse.parse(await withCounts(true)));
});

router.post("/admin/destinations", async (req, res): Promise<void> => {
  const parsed = CreateDestinationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid destination" });
    return;
  }
  const country = parsed.data.country.trim();
  const state = parsed.data.state?.trim() || null;
  const city = parsed.data.city?.trim() || null;
  if (city && !state) {
    res.status(400).json({ message: "Select a state before selecting a city" });
    return;
  }
  if (!(await destinationExistsInCatalog({ country, state, city }))) {
    res.status(400).json({
      message: "This Country, State and City combination is not in Locations",
    });
    return;
  }
  const [created] = await db
    .insert(destinationsTable)
    .values({
      ...parsed.data,
      title: parsed.data.title.trim(),
      country,
      state,
      city,
    })
    .returning();
  res.status(201).json(
    CreateDestinationResponse.parse({ ...created!, propertyCount: 0 }),
  );
});

router.put("/admin/destinations/:id", async (req, res): Promise<void> => {
  const params = UpdateDestinationParams.safeParse(req.params);
  const body = UpdateDestinationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid destination" });
    return;
  }
  const country = body.data.country.trim();
  const state = body.data.state?.trim() || null;
  const city = body.data.city?.trim() || null;
  if (city && !state) {
    res.status(400).json({ message: "Select a state before selecting a city" });
    return;
  }
  const [existing] = await db
    .select()
    .from(destinationsTable)
    .where(eq(destinationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ message: "Destination not found" });
    return;
  }
  const hierarchyUnchanged =
    existing.country.toLowerCase() === country.toLowerCase() &&
    (existing.state ?? "").toLowerCase() === (state ?? "").toLowerCase() &&
    (existing.city ?? "").toLowerCase() === (city ?? "").toLowerCase();
  if (!hierarchyUnchanged && !(await destinationExistsInCatalog({ country, state, city }))) {
    res.status(400).json({
      message: "This Country, State and City combination is not in Locations",
    });
    return;
  }
  const [updated] = await db
    .update(destinationsTable)
    .set({
      ...body.data,
      title: body.data.title.trim(),
      country,
      state,
      city,
    })
    .where(eq(destinationsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Destination not found" });
    return;
  }
  res.json(UpdateDestinationResponse.parse({ ...updated, propertyCount: 0 }));
});

router.delete("/admin/destinations/:id", async (req, res): Promise<void> => {
  const params = DeleteDestinationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const deleted = await db
    .delete(destinationsTable)
    .where(eq(destinationsTable.id, params.data.id))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ message: "Destination not found" });
    return;
  }
  res.json(DeleteDestinationResponse.parse({ message: "Destination deleted" }));
});

export default router;