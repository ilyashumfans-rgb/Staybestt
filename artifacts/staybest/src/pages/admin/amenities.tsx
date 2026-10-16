import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AmenityInputIcon, getGetAmenityCatalogQueryKey, useCreateAmenity, useCreateAmenityCategory, useGetAmenityCatalog, useDeleteAmenity } from "@workspace/api-client-react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AMENITY_ICONS, AmenityIcon } from "@/components/amenities/AmenityIcon";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function errMessage(err: any, fallback: string) {
  return err?.data?.message || err?.response?.data?.message || err?.message || fallback;
}

export default function AdminAmenities() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetAmenityCatalog();
  const createCategory = useCreateAmenityCategory();
  const createAmenity = useCreateAmenity();
  const deleteAmenity = useDeleteAmenity();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; category: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [amenity, setAmenity] = useState<{ categoryId: string; name: string; icon: AmenityInputIcon }>({ categoryId: "", name: "", icon: "check" });
  const [amenityError, setAmenityError] = useState("");
  const categories = data?.categories ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAmenityCatalogQueryKey() });

  const submitCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) return setCategoryError("Enter a category name.");
    if (name.length > 80) return setCategoryError("Keep it under 80 characters.");
    setCategoryError("");
    createCategory.mutate({ data: { name } }, {
      onSuccess: () => { toast.success("Category added"); setCategoryName(""); refresh(); },
      onError: (err) => setCategoryError(errMessage(err, "Could not add category")),
    });
  };

  const submitAmenity = (e: React.FormEvent) => {
    e.preventDefault();
    const name = amenity.name.trim();
    if (!amenity.categoryId) return setAmenityError("Choose a category.");
    if (!name) return setAmenityError("Enter an amenity name.");
    if (name.length > 80) return setAmenityError("Keep it under 80 characters.");
    setAmenityError("");
    createAmenity.mutate({ data: { categoryId: Number(amenity.categoryId), name, icon: amenity.icon } }, {
      onSuccess: () => { toast.success("Amenity added"); setAmenity(a => ({ ...a, name: "", icon: "check" })); refresh(); },
      onError: (err) => setAmenityError(errMessage(err, "Could not add amenity")),
    });
  };

  return (
    <AdminLayout title="Amenities">
      <p className="mb-6 text-muted-foreground">Partners and admins pick from this list when describing a property. Guests see only what is selected.</p>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <form onSubmit={submitCategory} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-secondary">Add category</h2>
            <Input value={categoryName} maxLength={80} placeholder="e.g. Wellness" onChange={e => setCategoryName(e.target.value)} aria-invalid={!!categoryError} />
            {categoryError && <p className="mt-2 text-xs text-destructive" role="alert">{categoryError}</p>}
            <Button type="submit" className="mt-3 w-full gap-2" disabled={createCategory.isPending}>
              {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add category
            </Button>
          </form>
          <form onSubmit={submitAmenity} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-secondary">Add amenity</h2>
            <label className="mb-1 block text-xs font-bold text-secondary">Category</label>
            <select value={amenity.categoryId} onChange={e => setAmenity({ ...amenity, categoryId: e.target.value })} className="mb-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary">
              <option value="">Select a category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="mb-1 block text-xs font-bold text-secondary">Name</label>
            <Input value={amenity.name} maxLength={80} placeholder="e.g. Steam Room" onChange={e => setAmenity({ ...amenity, name: e.target.value })} />
            <label className="mb-2 mt-3 block text-xs font-bold text-secondary">Icon</label>
            <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Amenity icon">
              {Object.values(AmenityInputIcon).map(key => (
                <button key={key} type="button" role="radio" aria-checked={amenity.icon === key} title={AMENITY_ICONS[key]?.label ?? key}
                  onClick={() => setAmenity({ ...amenity, icon: key })}
                  className={cn("flex items-center justify-center rounded-lg p-1 transition-colors", amenity.icon === key ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted")}>
                  <AmenityIcon icon={key} className="h-8 w-8" />
                </button>
              ))}
            </div>
            {amenityError && <p className="mt-2 text-xs text-destructive" role="alert">{amenityError}</p>}
            <Button type="submit" className="mt-3 w-full gap-2" disabled={createAmenity.isPending || categories.length === 0}>
              {createAmenity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add amenity
            </Button>
          </form>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-3 text-lg font-semibold text-secondary">USP &amp; Amenities</h2>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : isError ? (
            <div className="text-sm text-destructive">Could not load the catalog. <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet. Add the first one on the left.</p>
          ) : (
            <div className="divide-y">
              {categories.map(c => (
                <div key={c.id} className="py-5 first:pt-0">
                  <h3 className="mb-3 font-semibold text-secondary">{c.name} <span className="text-xs font-normal text-muted-foreground">({c.amenities.length})</span></h3>
                  {c.amenities.length === 0 ? <p className="text-xs text-muted-foreground">No amenities in this category yet.</p> : (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {c.amenities.map(a => <li key={a.id} className="flex items-center gap-2 text-sm text-secondary">
                        <AmenityIcon icon={a.icon} /><span className="flex-1">{a.name}</span>
                        <Button type="button" size="icon" variant="ghost" className="shrink-0 text-destructive hover:text-destructive" aria-label={`Delete ${a.name} from ${c.name}`}
                          onClick={() => { setDeleteError(""); setDeleteTarget({ id: a.id, name: a.name, category: c.name }); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleteAmenity.isPending) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
          <DialogDescription>
            This removes the amenity from {deleteTarget?.category} for new selections.
            Existing property and room selections will be kept. You can add it again later.
          </DialogDescription>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleteAmenity.isPending} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteAmenity.isPending} onClick={() => {
              if (!deleteTarget) return;
              setDeleteError("");
              deleteAmenity.mutate({ id: deleteTarget.id }, {
                onSuccess: catalog => {
                  queryClient.setQueryData(getGetAmenityCatalogQueryKey(), catalog);
                  void refresh();
                  setDeleteTarget(null);
                  toast.success("Amenity deleted from catalog");
                },
                onError: error => setDeleteError(errMessage(error, "Could not delete amenity. Please try again.")),
              });
            }}>{deleteAmenity.isPending ? "Deleting…" : "Delete amenity"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
