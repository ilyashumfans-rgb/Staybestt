import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { 
  useListAdminOffers, 
  useCreateOffer, 
  useUpdateOffer, 
  useDeleteOffer,
  getListAdminOffersQueryKey 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Edit2, Trash2, TicketPercent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AdminOffers() {
  const queryClient = useQueryClient();
  const { data: offers, isLoading } = useListAdminOffers({ query: { queryKey: getListAdminOffersQueryKey() } });

  const createOff = useCreateOffer();
  const updateOff = useUpdateOffer();
  const deleteOff = useDeleteOffer();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "", description: "", couponCode: "", discountPercent: "", active: true
  });

  const resetForm = () => {
    setFormData({ title: "", description: "", couponCode: "", discountPercent: "", active: true });
    setEditingId(null);
  };

  const handleEdit = (offer: any) => {
    setFormData({
      title: offer.title,
      description: offer.description,
      couponCode: offer.couponCode || "",
      discountPercent: offer.discountPercent ? String(offer.discountPercent) : "",
      active: offer.active
    });
    setEditingId(offer.id);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this offer?")) {
      deleteOff.mutate({ id }, {
        onSuccess: () => {
          toast.success("Offer deleted");
          queryClient.invalidateQueries({ queryKey: getListAdminOffersQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to delete offer")
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      title: formData.title,
      description: formData.description,
      couponCode: formData.couponCode || null,
      discountPercent: formData.discountPercent ? Number(formData.discountPercent) : null,
      active: formData.active
    };

    if (editingId) {
      updateOff.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast.success("Offer updated");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListAdminOffersQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to update")
      });
    } else {
      createOff.mutate({ data: payload }, {
        onSuccess: () => {
          toast.success("Offer created");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListAdminOffersQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to create")
      });
    }
  };

  return (
    <AdminLayout title="Manage Offers">
      <div className="flex justify-between items-center mb-6">
        <p className="text-muted-foreground">Manage homepage offers and promotions.</p>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Offer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Offer" : "Add New Offer"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div>
                <label className="text-xs font-bold text-secondary mb-1 block">Title</label>
                <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-secondary mb-1 block">Description</label>
                <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border border-input rounded-xl p-3 h-20 outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Coupon Code (Optional)</label>
                  <Input value={formData.couponCode} onChange={e => setFormData({...formData, couponCode: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Discount % (Optional)</label>
                  <Input type="number" value={formData.discountPercent} onChange={e => setFormData({...formData, discountPercent: e.target.value})} />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="active" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} className="w-4 h-4 text-primary focus:ring-primary rounded" />
                <label htmlFor="active" className="text-sm font-medium text-secondary">Offer is Active</label>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createOff.isPending || updateOff.isPending}>Save Offer</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : offers?.map(offer => (
          <div key={offer.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col ${!offer.active ? 'opacity-60' : ''}`}>
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <TicketPercent className="w-6 h-6" />
                </div>
                <Badge variant={offer.active ? "default" : "secondary"}>
                  {offer.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <h3 className="font-bold text-secondary text-lg mb-2">{offer.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{offer.description}</p>
              
              <div className="flex gap-2">
                {offer.couponCode && (
                  <Badge variant="outline" className="border-dashed border-primary text-primary">Code: {offer.couponCode}</Badge>
                )}
                {offer.discountPercent && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">{offer.discountPercent}% OFF</Badge>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-muted/20 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 bg-white" onClick={() => handleEdit(offer)}>
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="flex-1 bg-white text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleDelete(offer.id)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </div>
          </div>
        ))}
        {offers?.length === 0 && (
          <div className="col-span-3 text-center py-12 bg-white rounded-2xl border border-dashed">
            <p className="text-muted-foreground">No offers created yet.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}