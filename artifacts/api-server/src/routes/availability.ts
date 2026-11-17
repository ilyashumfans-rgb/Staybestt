import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, roomsTable, billingSettingsTable, propertiesTable } from "@workspace/db";
import { calculateGst, isDayOutCategory, GetDayOutQuoteQueryParams, GetDayOutQuoteResponse } from "@workspace/api-zod";
import {
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
} from "@workspace/api-zod";
import { bookedRoomsCount } from "../lib/availability";
import { stayPriceForRoom } from "../lib/pricing";
import { toRoomDto, nightsBetween, isValidDateString } from "../lib/mappers";

const router: IRouter = Router();

router.get("/day-out/quote", async (req, res): Promise<void> => {
  const parsed = GetDayOutQuoteQueryParams.safeParse(req.query);
  if (!parsed.success || !isValidDateString(parsed.data.date)) {
    res.status(400).json({ message: "Choose a valid visit date and between 1 and 100 guests." }); return;
  }
  const { propertyId, date, guests } = parsed.data;
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId));
  if (!property || property.status !== "active" || !isDayOutCategory(property.category) || !(property.startingPrice > 0)) {
    res.status(400).json({ message: "This Day Out is unavailable or its per-person price is not configured." }); return;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: property.timezone || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (date < today) { res.status(400).json({ message: "Choose today or a future visit date." }); return; }
  const [settings] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
  const baseTotalPrice = Math.round(property.startingPrice * guests * 100) / 100;
  const gstRateBps = settings?.gstRateBps ?? 0;
  const gstMode = settings?.gstMode ?? "exclusive";
  const gst = calculateGst(Math.round(baseTotalPrice * 100), gstRateBps, gstMode);
  res.json(GetDayOutQuoteResponse.parse({ pricePerPerson: property.startingPrice, baseTotalPrice, totalPrice: gst.totalMinor / 100, gstRateBps, gstMode }));
});

router.get("/availability", async (req, res): Promise<void> => {
  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const { propertyId, checkIn, checkOut, guests, adults, children, roomsCount = 1 } = parsed.data;
  const totalGuests = adults != null ? adults + (children ?? 0) : guests;

  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) {
    res.status(400).json({ message: "Dates must be in YYYY-MM-DD format" });
    return;
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) {
    res.status(400).json({ message: "Check-out must be after check-in" });
    return;
  }

  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.propertyId, propertyId))
    .orderBy(asc(roomsTable.pricePerNight));

  const [settings] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
  const result = await Promise.all(
    rooms
      .filter((r) => r.isAvailable !== false)
      .filter((r) => (totalGuests != null ? r.maxGuests * roomsCount >= totalGuests : true))
      .map(async (room) => {
        const booked = await bookedRoomsCount(room.id, checkIn, checkOut);
        const availableRooms = Math.max(0, room.totalRooms - booked);
        const baseTotalPrice = await stayPriceForRoom(room.id, room.pricePerNight, checkIn, nights);
        const gstRateBps = settings?.gstRateBps ?? 0;
        const gstMode = settings?.gstMode ?? "exclusive";
        const totalPrice = calculateGst(Math.round(baseTotalPrice * 100), gstRateBps, gstMode).totalMinor / 100;
        return {
          baseTotalPrice, gstRateBps, gstMode,
          room: toRoomDto(room),
          availableRooms,
          nights,
          pricePerNight: Math.round(totalPrice / nights),
          totalPrice,
        };
      }),
  );

  res.json(GetAvailabilityResponse.parse(result));
});

export default router;
