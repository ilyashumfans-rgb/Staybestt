import { describe, it, expect } from "vitest";
import { startingRoomPrice } from "../src/lib/propertyPricing";

describe("advertised property rates", () => {
  const room = (pricePerNight: number, isAvailable = true, totalRooms = 1) => ({ pricePerNight, isAvailable, totalRooms });
  it("uses updated room rates rather than a stale manual rate", () => {
    expect(startingRoomPrice(1, [room(1200)])).toBe(1200);
    expect(startingRoomPrice(1200, [room(900)])).toBe(900);
  });
  it("uses the lowest sellable room rate", () => {
    expect(startingRoomPrice(1, [room(1500), room(1200), room(1, false), room(2, true, 0)])).toBe(1200);
  });
  it("retains the configured starting rate when no sellable rooms exist", () => {
    expect(startingRoomPrice(1200, [])).toBe(1200);
    expect(startingRoomPrice(1200, [room(1, false)])).toBe(1200);
  });
});
