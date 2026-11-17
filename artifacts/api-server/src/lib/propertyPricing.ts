/** Room rates are authoritative; the manual price is only for properties without sellable rooms. */
export function startingRoomPrice(fallback: number, rooms: {
  pricePerNight: number; isAvailable: boolean; totalRooms: number;
}[]): number {
  const prices = rooms.filter(room => room.isAvailable && room.totalRooms > 0)
    .map(room => room.pricePerNight);
  return prices.length ? Math.min(...prices) : fallback;
}
