import { useState } from "react";
import { useCreateAgentRoom, useUpdateAgentRoom, useListAgentPropertyRooms, type Room, type RoomInput } from "@workspace/api-client-react";
import { SubcategoryPicker } from "@/components/property/SubcategoryPicker";
import { AmenityPicker } from "@/components/amenities/AmenityPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AgentPropertyRooms({ propertyId, category }: { propertyId: number; category: string }) {
  const { data: rooms = [], isLoading, isError, refetch } = useListAgentPropertyRooms(propertyId);
  const create = useCreateAgentRoom();
  const update = useUpdateAgentRoom();
  const empty = (): RoomInput => ({ propertyId, name: "", description: "", imageUrl: "", images: [], pricePerNight: 0, maxGuests: 2, totalRooms: 1, subcategories: [], amenities: [], isAvailable: true });
  const [form, setForm] = useState<RoomInput>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const edit = (room: Room) => { setEditing(room.id); setForm({ ...room }); };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Rooms remain subject to the property's approval status. Only your submitted properties can be managed here.</p>
    {isLoading && <p>Loading rooms…</p>}
    {isError && <p className="text-destructive">Could not load rooms. <button onClick={() => refetch()}>Retry</button></p>}
    {rooms.map(room => <div key={room.id} className="flex items-center justify-between border-b py-2 gap-3"><div><strong>{room.name}</strong><p className="text-sm">{room.subcategories?.join(", ") || "No subcategories selected"}</p></div><Button variant="outline" onClick={() => edit(room)}>Edit</Button></div>)}
    <form className="space-y-3 border rounded-xl p-4" onSubmit={async event => {
      event.preventDefault();
      try {
        if (editing) await update.mutateAsync({ id: editing, data: form });
        else await create.mutateAsync({ data: form });
        toast.success("Room saved"); setForm(empty()); setEditing(null); await refetch();
      } catch (error: any) { toast.error(error?.data?.message || error.message || "Could not save room"); }
    }}>
      <h3 className="font-semibold">{editing ? "Edit room" : "Add room"}</h3>
      <label className="block text-sm">Room name<Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label className="block text-sm">Description<Input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <label className="block text-sm">Room image URL<Input required type="url" value={form.imageUrl} onChange={event => setForm({ ...form, imageUrl: event.target.value })} /></label>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Price per night (₹)<Input required type="number" min="0" value={form.pricePerNight} onChange={event => setForm({ ...form, pricePerNight: Number(event.target.value) })} /></label>
        <label className="text-sm">Max guests<Input required type="number" min="1" value={form.maxGuests} onChange={event => setForm({ ...form, maxGuests: Number(event.target.value) })} /></label>
        <label className="text-sm">Total rooms<Input required type="number" min="1" value={form.totalRooms} onChange={event => setForm({ ...form, totalRooms: Number(event.target.value) })} /></label>
      </div>
      <SubcategoryPicker category={category} value={form.subcategories ?? []} onChange={subcategories => setForm({ ...form, subcategories })} />
      <AmenityPicker label="Room amenities" value={form.amenities ?? []} onChange={amenities => setForm(current => ({ ...current, amenities }))} />
      <div className="flex gap-3"><Button disabled={create.isPending || update.isPending} type="submit">{create.isPending || update.isPending ? "Saving…" : "Save room"}</Button>
        {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(empty()); }}>Cancel edit</Button>}</div>
    </form>
  </div>;
}
