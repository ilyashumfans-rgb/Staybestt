/** Day Out is the only catalog category that does not reserve overnight rooms. */
export function isDayOutCategory(category: string | null | undefined): boolean {
  return (category ?? "").toLowerCase().replace(/[\s_-]/g, "") === "dayout";
}
