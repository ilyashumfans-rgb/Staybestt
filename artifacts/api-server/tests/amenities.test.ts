import { describe, expect, it } from "vitest";
import { amenityKey, groupSelectedAmenities } from "../../../lib/api-client-react/src/amenities";

const catalog = [
  { id: 1, name: "USP & Amenities", amenities: [
    { id: 1, name: "WiFi", icon: "wifi" },
    { id: 2, name: "Private Pool", icon: "pool" },
  ] },
  { id: 2, name: "Common Amenities", amenities: [
    { id: 3, name: "Wi-Fi", icon: "wifi" },
    { id: 4, name: "AC", icon: "ac" },
  ] },
];
describe("selected amenity grouping", () => {
  it("does not select defaults for a property", () => {
    expect(groupSelectedAmenities(catalog, [])).toEqual([]);
  });
  it("matches legacy spellings without losing unknown selections", () => {
    const groups = groupSelectedAmenities(catalog, ["Wi-Fi", "Air Conditioning", "Parking"]);
    expect(groups.map(g => g.name)).toEqual(["USP & Amenities", "Common Amenities", "Other Amenities"]);
    expect(groups[1].amenities.map(a => a.name)).toEqual(["Wi-Fi", "AC"]);
    expect(groups[2].amenities[0].name).toEqual("Parking");
    expect(groups.flatMap(g => g.amenities).some(a => a.name === "Private Pool")).toBe(false);
  });
  it("keeps custom amenities visible with an empty catalog", () => {
    expect(groupSelectedAmenities([], ["Library"])[0].amenities[0].name).toBe("Library");
  });
  it("does not mistake a shared pool for a private pool", () => {
    expect(amenityKey("Swimming Pool")).not.toEqual(amenityKey("Private Pool"));
  });
  it("does not mutate selections and deduplicates legacy names", () => {
    const selected = ["Parking", "parking"];
    expect(groupSelectedAmenities(catalog, selected)[0].amenities).toHaveLength(1);
    expect(selected).toEqual(["Parking", "parking"]);
  });
});
