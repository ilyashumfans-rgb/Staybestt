import React, { useState } from "react";
import {
  useListAdminLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useSetLocationApproval,
  useSetPostalDirectoryApproval,
  getListAdminLocationsQueryKey,
  getListLocationsQueryKey,
  getListAdminPostalDirectoryQueryKey,
  AdminLocation
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, MapPin, Search, ChevronDown, Pencil, X, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const emptyForm = {
  country: "India",
  state: "",
  district: "",
  city: "",
  area: "",
  pincode: "",
};

export function LegacyLocations() {
  const queryClient = useQueryClient();
  const { data: locations, isLoading } = useListAdminLocations();
  const createLoc = useCreateLocation();
  const updateLoc = useUpdateLocation();
  const deleteLoc = useDeleteLocation();
  const setApproval = useSetLocationApproval();
  const setPostalApproval = useSetPostalDirectoryApproval();

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminLocationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminPostalDirectoryQueryKey() });
  };
  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      country: form.country.trim(),
      state: form.state.trim(),
      district: form.district.trim() || null,
      city: form.city.trim(),
      area: form.area.trim(),
      pincode: form.pincode.trim(),
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(editingId === null ? "Location added" : "Location updated");
        resetForm();
        refresh();
      },
      onError: (err: any) =>
        toast.error(err?.data?.message || err?.message || "Failed to save location"),
    };
    if (editingId === null) {
      createLoc.mutate({ data }, callbacks);
    } else {
      updateLoc.mutate({ id: editingId, data }, callbacks);
    }
  };

  const handleEdit = (location: AdminLocation) => {
    if (location.postalDirectoryId) {
      toast.error("Directory-linked locations must be managed in the Postal Directory tab.");
      return;
    }
    setEditingId(location.id);
    setForm({
      country: location.country,
      state: location.state,
      district: location.district ?? "",
      city: location.city,
      area: location.area,
      pincode: location.pincode,
    });
  };

  const handleDelete = (id: number, label: string, isDirectory: boolean) => {
    if (isDirectory) {
      toast.error("Directory-linked locations cannot be deleted. Unapprove them in the Postal Directory tab instead.");
      return;
    }
    if (!confirm(`Remove "${label}" from the location list? Existing properties keep their saved location.`)) return;
    deleteLoc.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Location removed");
          if (editingId === id) resetForm();
          refresh();
        },
        onError: (err: any) =>
          toast.error(err?.data?.message || err?.message || "Failed to remove"),
      },
    );
  };

  const handleToggleApproval = (id: number, checked: boolean, postalDirectoryId?: number | null) => {
    if (postalDirectoryId) {
      setPostalApproval.mutate(
        { id: postalDirectoryId, data: { approved: checked } },
        {
          onSuccess: () => {
            toast.success(checked ? "Location approved" : "Location unapproved");
            refresh();
          },
          onError: (err: any) =>
            toast.error(err?.data?.message || err?.message || "Failed to change approval"),
        }
      );
      return;
    }
    setApproval.mutate(
      { id, data: { approved: checked } },
      {
        onSuccess: () => {
          toast.success(checked ? "Location approved" : "Location unapproved");
          refresh();
        },
        onError: (err: any) =>
          toast.error(err?.data?.message || err?.message || "Failed to change approval"),
      }
    );
  };

  // Normalize names so capitalization and accidental spaces do not create duplicate city cards.
  const byCity = new Map<string, { country: string; state: string; city: string; rows: AdminLocation[] }>();
  for (const l of locations ?? []) {
    const key = [l.country, l.state, l.city].map((value) => value.trim().toLocaleLowerCase()).join("|||");
    if (!byCity.has(key)) {
      byCity.set(key, { country: l.country.trim(), state: l.state.trim(), city: l.city.trim(), rows: [] });
    }
    byCity.get(key)!.rows.push(l);
  }
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const cityGroups = [...byCity.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) =>
        (a.district ?? "").localeCompare(b.district ?? "") || a.area.localeCompare(b.area),
      ),
    }))
    .filter((group) =>
      !normalizedSearch ||
      [group.city, group.state, group.country, ...group.rows.flatMap((row) => [row.district ?? "", row.area, row.pincode])]
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch)),
    )
    .sort((a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state));

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-secondary">Active Database</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Locations managed here are active and selectable by partners. Existing manually entered records are approved by default, preserving their active status. To modify or uncheck directory-linked rows, use the Postal Directory tab.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white border rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4 items-end">
        <div className="sm:col-span-2 xl:col-span-7 flex items-center justify-between">
          <h2 className="font-black text-secondary">{editingId === null ? "Add Custom Location" : "Edit Custom Location"}</h2>
          {editingId !== null && (
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={resetForm}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Country</label>
          <Input required value={form.country} placeholder="e.g. India" onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">State</label>
          <Input required value={form.state} placeholder="e.g. Maharashtra" onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">District <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input value={form.district} placeholder="e.g. Mumbai Suburban" onChange={(e) => setForm({ ...form, district: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">City</label>
          <Input required value={form.city} placeholder="e.g. Mumbai" onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Area</label>
          <Input required value={form.area} placeholder="e.g. Andheri West" onChange={(e) => setForm({ ...form, area: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Pincode</label>
          <Input required value={form.pincode} placeholder="e.g. 400053" inputMode="numeric" onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
        </div>
        <Button type="submit" className="gap-2" disabled={createLoc.isPending || updateLoc.isPending}>
          {createLoc.isPending || updateLoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId === null ? <Plus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          {editingId === null ? "Add Location" : "Save Location"}
        </Button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-secondary">All Locations</h2>
          <p className="text-sm text-muted-foreground">
            {byCity.size} {byCity.size === 1 ? "city" : "cities"} · {locations?.length ?? 0} areas
          </p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search city, state, area or pincode"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (locations?.length ?? 0) === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No locations yet. Add a custom location or browse the directory.
        </div>
      ) : cityGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white py-12 text-center text-muted-foreground">
          No locations match “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {cityGroups.map(({ country, state, city, rows }) => (
            <details key={`${country}-${state}-${city}`} className="group overflow-hidden rounded-2xl border bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-muted/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-black text-secondary">{city}</div>
                  <div className="truncate text-xs text-muted-foreground">{state}, {country}</div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-secondary">
                  {rows.length} {rows.length === 1 ? "area" : "areas"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t">
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.8fr)_auto] gap-3 border-b bg-muted/20 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>District</span>
                  <span>Area</span>
                  <span>Pincode</span>
                  <span className="sr-only">Actions</span>
                </div>
                {rows.map((location) => {
                  const isDir = !!location.postalDirectoryId;
                  return (
                    <div key={location.id} className="grid grid-cols-1 items-center gap-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.8fr)_auto] sm:gap-3 hover:bg-muted/10 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:hidden">District</div>
                        <div className="truncate text-sm font-semibold text-secondary">{location.district?.trim() || "—"}</div>
                        <div className="mt-1">
                          {!location.approved ? (
                            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground h-5 px-1.5">Unapproved</Badge>
                          ) : isDir ? (
                            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/70 h-5 px-1.5 bg-primary/5">Directory</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-green-500/20 text-green-600 h-5 px-1.5 bg-green-500/5">Custom</Badge>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:hidden">Area</div>
                        <div className="truncate text-sm font-semibold text-secondary">{location.area}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:hidden">Pincode</div>
                        <div className="text-xs text-muted-foreground">{location.pincode}</div>
                      </div>
                      <div className="flex justify-end gap-1 items-center">
                        <div className="flex items-center space-x-2 mr-2">
                          <Checkbox
                            id={`approve-loc-${location.id}`}
                            checked={location.approved}
                            onCheckedChange={(c) => handleToggleApproval(location.id, !!c, location.postalDirectoryId)}
                            disabled={setApproval.isPending || setPostalApproval.isPending}
                          />
                          <label htmlFor={`approve-loc-${location.id}`} className="text-xs font-medium cursor-pointer select-none">
                            {location.approved ? "Approved" : "Approve"}
                          </label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={isDir ? "opacity-30 cursor-not-allowed" : ""}
                          aria-label={`Edit ${location.area}`}
                          onClick={() => handleEdit(location)}
                          title={isDir ? "Edit in Postal Directory tab" : `Edit ${location.area}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={isDir ? "opacity-30 cursor-not-allowed" : ""}
                          aria-label={`Delete ${location.area}`}
                          onClick={() => handleDelete(location.id, `${location.city}, ${location.state} – ${location.area} (${location.pincode})`, isDir)}
                          title={isDir ? "Unapprove in Postal Directory tab" : `Delete ${location.area}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
