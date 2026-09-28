import type { Property, Room, Booking } from "@workspace/db";
import type { BookingRefundSummaryDto } from "./refunds";
import type { PaymentSummary } from "./razorpay";
import { getRazorpayReadiness } from "./razorpayProvider";

export function toPropertySummary(p: Property) {
  return {
    id: p.id,
    propertyNumber: p.propertyNumber,
    status: p.status,
    name: p.name,
    category: p.category,
    country: p.country,
    state: p.state,
    city: p.city,
    area: p.area,
    pincode: p.pincode,
    landmark: p.landmark,
    description: p.description,
    imageUrl: p.imageUrl,
    rating: p.rating,
    reviewCount: p.reviewCount,
    startingPrice: p.startingPrice,
    amenities: p.amenities,
    freeCancellation: p.freeCancellation,
    breakfastIncluded: p.breakfastIncluded,
    featured: p.featured,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

export function toRoomDto(r: Room) {
  return {
    id: r.id,
    propertyId: r.propertyId,
    name: r.name,
    description: r.description,
    imageUrl: r.imageUrl,
    images: r.images ?? [],
    maxGuests: r.maxGuests,
    totalRooms: r.totalRooms,
    pricePerNight: r.pricePerNight,
    isAvailable: r.isAvailable,
    amenities: r.amenities,
  };
}

export function toBookingDto(
  b: Booking,
  property: Property,
  room: Room,
  refundSummary?: BookingRefundSummaryDto | null,
  paymentSummary?: PaymentSummary | null,
) {
  return {
    id: b.id,
    bookingRef: b.bookingRef ?? null,
    propertyId: b.propertyId,
    propertyName: property.name,
    propertyCity: property.city,
    propertyImageUrl: property.imageUrl,
    roomId: b.roomId,
    roomName: room.name,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: nightsBetween(b.checkIn, b.checkOut),
    guests: b.guests,
    adults: b.adults ?? b.guests,
    children: b.children ?? 0,
    roomsCount: b.roomsCount,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    specialRequests: b.specialRequests,
    status: b.status,
    paymentAllowed: getRazorpayReadiness().paymentAllowed,
    totalAmount: b.totalAmount,
    couponCode: b.couponCode,
    discountAmount: b.discountAmount,
    paymentHoldExpiresAt: b.paymentHoldExpiresAt?.toISOString() ?? null,
    freeCancellation: property.freeCancellation,
    ...(refundSummary ? { refundSummary } : {}),
    ...(paymentSummary ? { paymentSummary } : {}),
    createdAt: b.createdAt.toISOString(),
  };
}

export function toPropertyDetail(p: Property, rooms: Room[]) {
  return {
    ...toPropertySummary(p),
    ownerId: p.ownerId ?? null,
    address: p.address,
    images: p.images,
    policies: p.policies,
    timezone: p.timezone,
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    rooms: rooms.map(toRoomDto),
  };
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const inDate = new Date(`${checkIn}T00:00:00Z`).getTime();
  const outDate = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((outDate - inDate) / 86_400_000);
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
