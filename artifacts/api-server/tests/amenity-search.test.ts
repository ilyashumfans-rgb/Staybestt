import { describe, expect, it } from "vitest";
import { amenitySearchKey, matchesAmenities } from "../src/lib/amenityMatching";
import { amenityKey, groupSelectedAmenities } from "../../../lib/api-client-react/src/amenities";

describe("catalog-based amenity search", () => {
  it("matches the same aliases used by the property display", () => {
    for (const name of ["Wi-Fi", "WiFi", "Wireless Internet", "Air Conditioning", "Home Theater", "Barbeque", "Fridge", "Pet Friendly"]) {
      expect(amenitySearchKey(name)).toBe(amenityKey(name));
    }
    expect(matchesAmenities(["Wireless Internet", "Air Conditioning"], ["Wi-Fi", "AC"])).toBe(true);
  });
  it("requires all chosen amenities and supports new admin-defined names", () => {
    expect(matchesAmenities(["Pet Friendly", "EV Charging"], ["Pet Friendly", "EV Charging"])).toBe(true);
    expect(matchesAmenities(["Pet Friendly"], ["Pet Friendly", "EV Charging"])).toBe(false);
    expect(matchesAmenities([], [])).toBe(true);
  });
  it("shows selected amenities in new backend groups, without adding unselected facilities", () => {
    const groups = groupSelectedAmenities([
      { id: 10, name: "Preferences", amenities: [{ id: 20, name: "Pet Friendly", icon: "check" }, { id: 21, name: "Pay at Property", icon: "check" }] },
      { id: 11, name: "Transport", amenities: [{ id: 22, name: "EV Charging", icon: "check" }] },
    ], ["Pet Friendly", "EV Charging"]);
    expect(groups.map(group => group.name)).toEqual(["Preferences", "Transport"]);
    expect(groups.flatMap(group => group.amenities.map(item => item.name))).toEqual(["Pet Friendly", "EV Charging"]);
  });
});
