import { useState } from "react";
import { useParams, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { 
  useGetProperty, 
  useCreateRoom, 
  useUpdateRoom, 
  useDeleteRoom,
  getGetPropertyQueryKey 
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Edit2, Trash2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AdminRooms() {
  const params = useParams();
  const propertyId = Number(params.id);
  const queryClient = useQueryClient();

  const { data: property, isLoading } = useGetProperty(propertyId, { 
    query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) } 
  });

  const createRm = useCreateRoom();
  const updateRm = useUpdateRoom();
  const deleteRm = useDeleteRoom();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "", description: "", imageUrl: "", maxGuests: "2", totalRooms: "5", pricePerNight: "", amenities: ""
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", imageUrl: "", maxGuests: "2", totalRooms: "5", pricePerNight: "", amenities: "" });
    setEditingId(null);
  };

  const handleEdit = (room: any) => {
    setFormData({
      name: room.name,
      description: room.description,
      imageUrl: room.imageUrl,
      maxGuests: String(room.maxGuests),
      totalRooms: String(room.totalRooms),
      pricePerNight: String(room.pricePerNight),
      amenities: room.amenities.join(", ")
    });
    setEditingId(room.id);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this room type?")) {
      deleteRm.mutate({ id }, {
        onSuccess: () => {
          toast.success("Room deleted");
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(propertyId) });
        },
        onError: (err) => {
          toast.error(err.message || "Cannot delete room (it may have active bookings).");
        }
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      propertyId,
      name: formData.name,
      description: formData.description,
      imageUrl: formData.imageUrl,
      maxGuests: Number(formData.maxGuests),
      totalRooms: Number(formData.totalRooms),
      pricePerNight: Number(formData.pricePerNight),
      amenities: formData.amenities.split(",").map(s => s.trim()).filter(Boolean)
    };

    if (editingId) {
      updateRm.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast.success("Room updated");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(propertyId) });
        },
        onError: (err) => toast.error(err.message || "Failed to update")
      });
    } else {
      createRm.mutate({ data: payload }, {
        onSuccess: () => {
          toast.success("Room created");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(propertyId) });
        },
        onError: (err) => toast.error(err.message || "Failed to create")
      });
    }
  };

  return (
    <AdminLayout title="Manage Rooms">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <Link href="/admin/properties" className="text-sm text-primary hover:underline flex items-center gap-1 mb-2">
            <ArrowLeft className="w-3 h-3" /> Back to Properties
          </Link>
          <h2 className="text-xl font-bold text-secondary">{property?.name || "Loading..."} - Rooms</h2>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Room</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Room" : "Add New Room"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Room Name</label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Description</label>
                  <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border border-input rounded-xl p-3 h-20 outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Image URL</label>
                  <Input required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Price Per Night (INR)</label>
                  <Input type="number" required value={formData.pricePerNight} onChange={e => setFormData({...formData, pricePerNight: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Max Guests</label>
                  <Input type="number" required value={formData.maxGuests} onChange={e => setFormData({...formData, maxGuests: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Total Rooms Available</label>
                  <Input type="number" required value={formData.totalRooms} onChange={e => setFormData({...formData, totalRooms: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Amenities (comma separated)</label>
                  <Input required value={formData.amenities} onChange={e => setFormData({...formData, amenities: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createRm.isPending || updateRm.isPending}>Save Room</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : property?.rooms.map(room => (
          <div key={room.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col">
            <div className="aspect-[4/3] relative">
              <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover" />
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-secondary">
                {room.totalRooms} Total
              </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-secondary text-lg">{room.name}</h3>
                <span className="text-primary font-bold">{formatPrice(room.pricePerNight)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Up to {room.maxGuests} guests</p>
              
              <div className="flex gap-2 mt-auto pt-4 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(room)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleDelete(room.id)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
        {property?.rooms.length === 0 && (
          <div className="col-span-3 text-center py-12 bg-white rounded-2xl border border-dashed">
            <p className="text-muted-foreground">No rooms added yet. Create one to allow bookings.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}