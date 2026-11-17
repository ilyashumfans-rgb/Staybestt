/** Keep legacy spellings equivalent to the catalog's client-side amenityKey. */
export function amenitySearchKey(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    wirelessinternet: "wifi", television: "tv", airconditioning: "ac",
    airconditioner: "ac", hometheater: "hometheatre", barbeque: "bbq",
    barbecue: "bbq", fridge: "refrigerator",
  };
  return aliases[key] ?? key;
}

export function matchesAmenities(selected: string[], requested: string[]) {
  const have = new Set(selected.map(amenitySearchKey));
  return requested.every(name => have.has(amenitySearchKey(name)));
}
