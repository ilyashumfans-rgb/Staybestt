import { amenityKey, useGetAmenityCatalog } from "@workspace/api-client-react";
import { AmenityIcon } from "@/components/amenities/AmenityIcon";
import { ChevronDown } from "lucide-react";

export function AmenityFilters({ search, onChange }: {
  search: string; onChange: (params: URLSearchParams) => void;
}) {
  const { data, isLoading, isError, refetch } = useGetAmenityCatalog();
  const params = new URLSearchParams(search);
  const selected = (params.get("amenities") ?? "").split(",").filter(Boolean);
  const preferenceKey = (name: string) => {
    const key = amenityKey(name);
    return key === "freecancellation" ? "freeCancellation" : key === "breakfastincluded" ? "breakfastIncluded" : null;
  };
  const checked = (name: string) => {
    const flag = preferenceKey(name);
    return (flag && params.get(flag) === "true") || selected.some(value => amenityKey(value) === amenityKey(name));
  };
  const toggle = (name: string) => {
    const next = new URLSearchParams(search);
    const remaining = selected.filter(value => amenityKey(value) !== amenityKey(name));
    const flag = preferenceKey(name);
    if (flag) {
      if (checked(name)) next.delete(flag);
      else next.set(flag, "true");
    } else if (!checked(name)) remaining.push(name);
    if (remaining.length) next.set("amenities", remaining.join(","));
    else next.delete("amenities");
    onChange(next);
  };
  const preferences = data?.categories.find(group => group.name.trim().toLowerCase() === "preferences");
  return <div className="space-y-5">
    <fieldset className="space-y-3">
      <legend className="mb-3 font-semibold">Preferences</legend>
      {isLoading && <p className="text-sm text-muted-foreground">Loading preferences…</p>}
      {isError && <p className="text-sm text-destructive">Could not load preferences. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>}
      {preferences?.amenities.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary"
          checked={!!checked(item.name)} onChange={() => toggle(item.name)} />
        <AmenityIcon icon={item.icon} className="h-7 w-7" />
        <span>{item.name}</span>
      </label>)}
    </fieldset>
    <details aria-label="Amenities filters" className="group/amenities">
    <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-semibold [&::-webkit-details-marker]:hidden">
      Amenities
      <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open/amenities:rotate-180" />
    </summary>
    <div className="mt-3 space-y-4">
    {isLoading && <p className="text-sm text-muted-foreground">Loading amenities…</p>}
    {isError && <p className="text-sm text-destructive">Could not load amenities. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>}
    {data?.categories.filter(group => group.id !== preferences?.id).map(group => <details key={group.id} className="group/category border-b pb-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>{group.name}{group.amenities.some(item => checked(item.name)) && <span className="ml-2 text-xs text-primary">({group.amenities.filter(item => checked(item.name)).length} selected)</span>}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open/category:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
      {group.amenities.length === 0 && <p className="text-xs text-muted-foreground">No options available.</p>}
      {group.amenities.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary"
          checked={!!checked(item.name)} onChange={() => toggle(item.name)} />
        <AmenityIcon icon={item.icon} className="h-7 w-7" />
        <span>{item.name}</span>
      </label>)}
      </div>
    </details>)}
    {(selected.length > 0 || params.get("freeCancellation") === "true" || params.get("breakfastIncluded") === "true") &&
      <button type="button" className="text-xs underline" onClick={() => {
        const next = new URLSearchParams(search);
        ["amenities", "freeCancellation", "breakfastIncluded"].forEach(key => next.delete(key));
        onChange(next);
      }}>Clear amenity filters</button>}
    </div>
  </details>
  </div>;
}
