export function calculateGst(amountMinor: number, rateBps = 0, mode: string = "exclusive") {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 2147483647 ||
      !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000 ||
      !["inclusive", "exclusive"].includes(mode)) throw new Error("Invalid GST amount or rate");
  const subtotalMinor = mode === "inclusive" ? Math.round(amountMinor * 10000 / (10000 + rateBps)) : amountMinor;
  const taxMinor = mode === "inclusive" ? amountMinor - subtotalMinor : Math.round(amountMinor * rateBps / 10000);
  const totalMinor = subtotalMinor + taxMinor;
  if (totalMinor > 2147483647) throw new Error("GST total exceeds supported amount");
  return { subtotalMinor, taxMinor, totalMinor };
}
