import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, roomsTable } from "@workspace/db";
import {
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
} from "@workspace/api-zod";
import { bookedRoomsCount } from "../lib/availability";
import { stayPriceForRoom } from "../lib/pricing";
import { toRoomDto, nightsBetween, isValidDateString } from "../lib/mappers";

const router: IRouter = Router();

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

  const result = await Promise.all(
    rooms
      .filter((r) => r.isAvailable !== false)
      .filter((r) => (totalGuests != null ? r.maxGuests * roomsCount >= totalGuests : true))
      .map(async (room) => {
        const booked = await bookedRoomsCount(room.id, checkIn, checkOut);
        const availableRooms = Math.max(0, room.totalRooms - booked);
        const totalPrice = await stayPriceForRoom(room.id, room.pricePerNight, checkIn, nights);
        return {
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
