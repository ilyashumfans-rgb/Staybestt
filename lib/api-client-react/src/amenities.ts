import type { AmenityGroup } from "./generated/api.schemas";

/** Shared matching keeps old free-text selections visible without rewriting them. */
export function amenityKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    wirelessinternet: "wifi", television: "tv", airconditioning: "ac",
    airconditioner: "ac", hometheater: "hometheatre", barbeque: "bbq",
    barbecue: "bbq", fridge: "refrigerator",
  };
  return aliases[key] ?? key;
}

export function groupSelectedAmenities(categories: AmenityGroup[], selected: string[]): AmenityGroup[] {
  const selectedKeys = new Set(selected.map(amenityKey));
  const matched = new Set<string>();
  const groups = categories.map(category => ({
    ...category,
    amenities: category.amenities.filter(item => {
      const key = amenityKey(item.name);
      if (!selectedKeys.has(key)) return false;
      matched.add(key);
      return true;
    }),
  })).filter(category => category.amenities.length > 0);
  const other = [...new Map(selected.filter(name => !matched.has(amenityKey(name))).map(name => [amenityKey(name), name])).values()];
  if (other.length) groups.push({
    id: -1, name: "Other Amenities",
    amenities: other.map((name, index) => ({ id: -index - 1, name, icon: "check" })),
  });
  return groups;
}
