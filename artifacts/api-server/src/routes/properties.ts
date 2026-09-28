import { Router, type IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, propertiesTable, roomsTable, locationsTable } from "@workspace/db";
import {
  ListLocationsResponse,
  SearchPropertiesQueryParams,
  SearchPropertiesResponse,
  GetPropertyParams,
  GetPropertyResponse,
} from "@workspace/api-zod";
import { toPropertySummary, toRoomDto } from "../lib/mappers";
import { resolveUser } from "../lib/auth";

const router: IRouter = Router();

// Admin-managed country/state/district/city/area/pincode options for property forms.
router.get("/locations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.approved, true))
    .orderBy(
      asc(locationsTable.country),
      asc(locationsTable.state),
      asc(locationsTable.district),
      asc(locationsTable.city),
      asc(locationsTable.area),
    );
  res.json(ListLocationsResponse.parse(rows));
});

router.get("/properties", async (req, res): Promise<void> => {
  const parsed = SearchPropertiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const q = parsed.data;
  if ((q.latitude == null) !== (q.longitude == null)) {
    res.status(400).json({ message: "latitude and longitude must be provided together" });
    return;
  }

  let rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.status, "active"));

  if (q.q) {
    const needle = q.q.toLowerCase();
    rows = rows.filter((p) =>
      [p.name, p.city, p.area, p.landmark ?? ""].some((f) =>
        f.toLowerCase().includes(needle),
      ),
    );
  }
  if (q.city) {
    const city = q.city.toLowerCase();
    rows = rows.filter((p) => p.city.toLowerCase() === city);
  }
  if (q.country || q.state) {
    const managedLocations = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.approved, true));
    rows = rows.filter((property) => {
      if (property.country || property.state) {
        return (
          (!q.country ||
            property.country?.toLowerCase() === q.country.toLowerCase()) &&
          (!q.state || property.state?.toLowerCase() === q.state.toLowerCase())
        );
      }
      return managedLocations.some(
        (location) =>
          (!q.country ||
            location.country.toLowerCase() === q.country.toLowerCase()) &&
          (!q.state || location.state.toLowerCase() === q.state.toLowerCase()) &&
          location.city.toLowerCase() === property.city.toLowerCase() &&
          location.area.toLowerCase() === property.area.toLowerCase() &&
          (!property.pincode || location.pincode === property.pincode),
      );
    });
  }
  if (q.category) {
    const cats = q.category
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    if (cats.length > 0) {
      rows = rows.filter((p) => cats.includes(p.category.toLowerCase()));
    }
  }
  if (q.minPrice != null) {
    rows = rows.filter((p) => p.startingPrice >= q.minPrice!);
  }
  if (q.maxPrice != null) {
    rows = rows.filter((p) => p.startingPrice <= q.maxPrice!);
  }
  if (q.minRating != null) {
    rows = rows.filter((p) => p.rating >= q.minRating!);
  }
  if (q.amenities) {
    const wanted = q.amenities
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    rows = rows.filter((p) => {
      const have = p.amenities.map((a) => a.toLowerCase());
      return wanted.every((w) => have.includes(w));
    });
  }
  if (q.freeCancellation === true) {
    rows = rows.filter((p) => p.freeCancellation);
  }
  if (q.breakfastIncluded === true) {
    rows = rows.filter((p) => p.breakfastIncluded);
  }

  const distanceById = new Map<number, number>();
  if (q.latitude != null && q.longitude != null) {
    const radiusKm = q.radiusKm ?? 50;
    rows = rows.filter((property) => {
      if (property.latitude == null || property.longitude == null) return false;
      const distanceKm = haversineDistanceKm(
        q.latitude!,
        q.longitude!,
        property.latitude,
        property.longitude,
      );
      distanceById.set(property.id, distanceKm);
      return distanceKm <= radiusKm;
    });
  }

  switch (q.sort) {
    case "distance":
      rows.sort((a, b) => (distanceById.get(a.id) ?? Infinity) - (distanceById.get(b.id) ?? Infinity));
      break;
    case "price_asc":
      rows.sort((a, b) => a.startingPrice - b.startingPrice);
      break;
    case "price_desc":
      rows.sort((a, b) => b.startingPrice - a.startingPrice);
      break;
    case "rating_desc":
      rows.sort((a, b) => b.rating - a.rating);
      break;
    case "popular":
    default:
      rows.sort((a, b) =>
        distanceById.size > 0
          ? (distanceById.get(a.id) ?? Infinity) - (distanceById.get(b.id) ?? Infinity)
          : b.popularityScore - a.popularityScore,
      );
      break;
  }

  res.json(SearchPropertiesResponse.parse(rows.map((property) => ({
    ...toPropertySummary(property),
    ...(distanceById.has(property.id)
      ? { distanceKm: Math.round(distanceById.get(property.id)! * 10) / 10 }
      : {}),
  }))));
});

function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));

  if (!property) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  if (property.status !== "active") {
    // Pending/suspended properties are hidden from the public, but the owner
    // and internal staff still need to view/edit them.
    const viewer = await resolveUser(req);
    const canView =
      !!viewer &&
      (viewer.id === property.ownerId ||
        viewer.role === "admin" ||
        viewer.role === "employee");
    if (!canView) {
      res.status(404).json({ message: "Property not found" });
      return;
    }
  }

  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.propertyId, property.id))
    .orderBy(asc(roomsTable.pricePerNight));

  res.json(
    GetPropertyResponse.parse({
      ...toPropertySummary(property),
      ownerId: property.ownerId ?? null,
      address: property.address,
      images: property.images,
      policies: property.policies,
      timezone: property.timezone,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      contactPhone: property.contactPhone,
      contactEmail: property.contactEmail,
      rooms: rooms.map(toRoomDto),
    }),
  );
});

export default router;
