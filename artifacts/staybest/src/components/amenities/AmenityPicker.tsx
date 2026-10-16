import { useMemo, useRef, useState } from "react";
import { amenityKey, useGetAmenityCatalog, useCreateAmenity, getGetAmenityCatalogQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AmenityIcon } from "./AmenityIcon";

interface Props { value: string[]; onChange: (next: string[]) => void; label?: string; allowCatalogAdd?: boolean }

/** Categorized checkbox picker. Same-key entries across categories are one selection; unknown values are preserved. */
export function AmenityPicker({ value, onChange, label = "USP & Amenities", allowCatalogAdd = false }: Props) {
  const { data, isLoading, isError, refetch } = useGetAmenityCatalog();
  const [custom, setCustom] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [addError, setAddError] = useState("");
  const createAmenity = useCreateAmenity();
  const queryClient = useQueryClient();
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const selectedKeys = useMemo(() => new Set(value.map(amenityKey)), [value]);
  const catalogKeys = useMemo(() => new Set((data?.categories ?? []).flatMap(c => c.amenities.map(a => amenityKey(a.name)))), [data]);
  const others = value.filter(v => !catalogKeys.has(amenityKey(v)));

  const toggle = (name: string) => {
    const key = amenityKey(name);
    onChange(selectedKeys.has(key) ? value.filter(v => amenityKey(v) !== key) : [...value, name]);
  };
  const addCustom = async () => {
    const name = custom.trim();
    if (!name || createAmenity.isPending) return;
    setAddError("");
    if (name.length > 80 || name.includes(",")) {
      setAddError("Use up to 80 characters, without commas."); return;
    }
    if (allowCatalogAdd && !categoryId) {
      setAddError("Choose the category for this amenity."); return;
    }
    try {
      let selectedName = name;
      if (allowCatalogAdd) {
        const category = data?.categories.find(group => group.id === Number(categoryId));
        if (!category) { setAddError("Choose an available category."); return; }
        const existing = category.amenities.find(item => amenityKey(item.name) === amenityKey(name));
        if (existing) selectedName = existing.name;
        else {
          const catalog = await createAmenity.mutateAsync({ data: { name, categoryId: category.id, icon: "check" } });
          queryClient.setQueryData(getGetAmenityCatalogQueryKey(), catalog);
          void queryClient.invalidateQueries({ queryKey: getGetAmenityCatalogQueryKey() });
        }
      }
      const current = latest.current;
      if (!current.value.some(item => amenityKey(item) === amenityKey(selectedName))) current.onChange([...current.value, selectedName]);
      setCustom("");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Could not add amenity. Please try again.");
    }
  };

  return (
    <div className="col-span-2 rounded-xl border border-input p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-bold text-secondary">{label}</span>
        <span className="text-xs text-muted-foreground">{value.length} selected</span>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : isError ? (
        <div className="flex items-center justify-between rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
          Could not load the amenity list. Current selections are kept.
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.categories.map(cat => (
            <fieldset key={cat.id}>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{cat.name}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {cat.amenities.map(item => {
                  const on = selectedKeys.has(amenityKey(item.name));
                  return (
                    <label key={item.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors", on ? "border-primary bg-primary/5 text-secondary" : "border-transparent hover:bg-muted/60")}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(item.name)} />
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3 w-3" />}</span>
                      <AmenityIcon icon={item.icon} className="h-7 w-7" />
                      <span className="truncate">{item.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <div className="mt-4 border-t pt-3">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Other Amenities</span>
        {others.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {others.map(o => (
              <span key={o} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-secondary">
                {o}
                <button type="button" aria-label={`Remove ${o}`} onClick={() => onChange(value.filter(v => amenityKey(v) !== amenityKey(o)))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {allowCatalogAdd && (
            <select aria-label="New amenity category" value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={isLoading || isError || createAmenity.isPending} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose category</option>
              {data?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          )}
          <Input className="min-w-[160px] flex-1" value={custom} maxLength={80} disabled={createAmenity.isPending} placeholder="Add another amenity" onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addCustom(); } }} />
          <Button type="button" aria-label="Add amenity" variant="outline" onClick={() => void addCustom()} disabled={!custom.trim() || createAmenity.isPending || (allowCatalogAdd && (!categoryId || isLoading || isError))}>{createAmenity.isPending ? "Adding…" : <Plus className="h-4 w-4" />}</Button>
        </div>
        {addError && <p role="alert" className="mt-2 text-sm text-destructive">{addError}</p>}
      </div>
    </div>
  );
}
