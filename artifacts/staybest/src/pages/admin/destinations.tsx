import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminDestinationsQueryKey,
  getListDestinationsQueryKey,
  useCreateDestination,
  useDeleteDestination,
  useListAdminDestinations,
  useListLocations,
  useUpdateDestination,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Map, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const emptyForm = {
  title: "",
  country: "India",
  state: "",
  city: "",
  imageUrl: "",
  sortOrder: 0,
  active: true,
};

export default function AdminDestinations() {
  const queryClient = useQueryClient();
  const { data: destinations, isLoading } = useListAdminDestinations();
  const { data: locations } = useListLocations();
  const createDestination = useCreateDestination();
  const updateDestination = useUpdateDestination();
  const deleteDestination = useDeleteDestination();
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  const countries = [...new Set((locations ?? []).map((item) => item.country))].sort();
  const states = [...new Set(
    (locations ?? [])
      .filter((item) => item.country === form.country)
      .map((item) => item.state),
  )].sort();
  const cities = [...new Set(
    (locations ?? [])
      .filter((item) => item.country === form.country && item.state === form.state)
      .map((item) => item.city),
  )].sort();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminDestinationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDestinationsQueryKey() });
  };

  const storeImage = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return null;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem("staybest-admin-key");
      const response = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!response.ok) throw new Error("Could not start upload");
      const { uploadURL, objectPath } = await response.json();
      const uploaded = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error("Image upload failed");
      return `/api/storage${objectPath}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadImage = async (file: File) => {
    const imageUrl = await storeImage(file);
    if (imageUrl) {
      setForm((current) => ({ ...current, imageUrl }));
      toast.success("Image uploaded");
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createDestination.mutate(
      {
        data: {
          ...form,
          title: form.title.trim(),
          country: form.country.trim(),
          state: form.state.trim() || null,
          city: form.city.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Destination added to the homepage");
          setForm(emptyForm);
          refresh();
        },
        onError: (error: any) =>
          toast.error(error?.data?.message || error?.message || "Could not add destination"),
      },
    );
  };

  return (
    <AdminLayout title="Destinations">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-muted-foreground">
          Add country, state, or city cards using the shared Locations list.
        </p>
        <Button asChild type="button" variant="outline" className="gap-2">
          <Link href="/admin/locations">
            <Plus className="h-4 w-4" /> Add missing location
          </Link>
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="mb-8 grid items-end gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-7">
        <div>
          <label className="mb-1 block text-xs font-bold">Title</label>
          <Input required value={form.title} placeholder="Explore Maharashtra" onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">Country</label>
          <select required className="h-10 w-full rounded-md border bg-white px-3" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value, state: "", city: "" })}>
            <option value="">Select country</option>
            {[form.country, ...countries.filter((item) => item !== form.country)].filter(Boolean).map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">State (optional)</label>
          <select className="h-10 w-full rounded-md border bg-white px-3" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value, city: "" })} disabled={!form.country}>
            <option value="">Entire country</option>
            {states.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">City (optional)</label>
          <select className="h-10 w-full rounded-md border bg-white px-3 disabled:bg-muted" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!form.state}>
            <option value="">{form.state ? "Entire state" : "Select state first"}</option>
            {cities.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">Display order</label>
          <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
        </div>
        <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {form.imageUrl ? "Change image" : "Upload image"}
          <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        </label>
        <Button disabled={!form.imageUrl || uploading || createDestination.isPending}>Add Destination</Button>
        {form.imageUrl && <img src={form.imageUrl} alt="Preview" className="h-32 w-full rounded-xl object-cover md:col-span-2 xl:col-span-7" />}
      </form>

      {isLoading ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin" />
      ) : !destinations?.length ? (
        <div className="rounded-2xl border bg-white py-16 text-center text-muted-foreground"><Map className="mx-auto mb-3 h-10 w-10" />No homepage destinations yet.</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {destinations.map((destination) => (
            <article key={destination.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <img src={destination.imageUrl} alt={destination.title} className="h-44 w-full object-cover" />
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="font-black text-secondary">{destination.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[destination.city, destination.state, destination.country].filter(Boolean).join(", ")} · {destination.propertyCount} properties
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateDestination.mutate(
                      { id: destination.id, data: { title: destination.title, country: destination.country, state: destination.state, city: destination.city, imageUrl: destination.imageUrl, sortOrder: destination.sortOrder, active: !destination.active } },
                      { onSuccess: refresh },
                    )}
                  >
                    {destination.active ? "Shown on home" : "Hidden"}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => {
                    if (confirm(`Delete ${destination.title}?`)) deleteDestination.mutate({ id: destination.id }, { onSuccess: refresh });
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold">
                  <Upload className="h-4 w-4" /> Change image
                  <input hidden type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const imageUrl = await storeImage(file);
                    if (!imageUrl) return;
                    updateDestination.mutate(
                      { id: destination.id, data: { title: destination.title, country: destination.country, state: destination.state, city: destination.city, imageUrl, sortOrder: destination.sortOrder, active: destination.active } },
                      { onSuccess: () => { toast.success("Destination image updated"); refresh(); } },
                    );
                  }} />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}