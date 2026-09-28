import { AdminLayout } from "@/components/layout/AdminLayout";
import { useState } from "react";
import { 
  useListAdminCommercialTerms, 
  getListAdminCommercialTermsQueryKey,
  useUpsertAdminCommercialTerms,
  UserCommercialTerms
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Loader2, Edit2, Wallet, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function AdminCommissions() {
  const queryClient = useQueryClient();
  
  const { data: terms, isLoading } = useListAdminCommercialTerms({
    query: { queryKey: getListAdminCommercialTermsQueryKey() }
  });

  const upsertTerms = useUpsertAdminCommercialTerms();

  const [editOpen, setEditOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<UserCommercialTerms | null>(null);
  
  const [form, setForm] = useState<{ mode: "percentage" | "fixed", value: string }>({
    mode: "percentage",
    value: "10"
  });

  const handleEditClick = (term: UserCommercialTerms) => {
    setEditingTerm(term);
    setForm({
      mode: (term.mode as "percentage" | "fixed") || "percentage",
      value: String(term.value)
    });
    setEditOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTerm) return;
    
    upsertTerms.mutate({
      userId: editingTerm.userId,
      data: {
        mode: form.mode,
        value: Number(form.value),
        expectedUpdatedAt: editingTerm.updatedAt || null
      }
    }, {
      onSuccess: () => {
        toast.success("Commercial terms updated");
        setEditOpen(false);
        setEditingTerm(null);
        queryClient.invalidateQueries({ queryKey: getListAdminCommercialTermsQueryKey() });
      },
      onError: (err: any) => {
        if (err?.response?.status === 409) {
          toast.error("Conflict: Terms were updated by another user. Please review and try again.");
          setEditOpen(false);
          setEditingTerm(null);
          queryClient.invalidateQueries({ queryKey: getListAdminCommercialTermsQueryKey() });
        } else {
          toast.error(err?.response?.data?.message || err.message || "Failed to update terms");
        }
      }
    });
  };

  const agentTerms = terms?.filter(t => t.role === 'agent') || [];
  const partnerTerms = terms?.filter(t => t.role === 'partner') || [];

  return (
    <AdminLayout title="Commercial Terms">
      <div className="max-w-5xl mx-auto">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-8 flex gap-4 items-start">
          <Wallet className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-secondary mb-1">Manage partner and agent commissions</h4>
            <p className="text-sm text-muted-foreground">
              Set default and per-user commission rules. Agents earn commissions on bookings they originate. Partners pay commissions on bookings received through StayBest.
            </p>
          </div>
        </div>

        <h3 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-muted-foreground" />
          Agent Terms (Earned Commissions)
        </h3>
        
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden mb-10">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                  <th className="p-4 font-bold">Agent Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Rule Type</th>
                  <th className="p-4 font-bold">Commission Value</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                  </tr>
                ) : agentTerms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No agents found.</td>
                  </tr>
                ) : agentTerms.map(term => (
                  <tr key={term.userId} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 font-bold text-secondary text-sm">{term.name}</td>
                    <td className="p-4 text-sm text-muted-foreground">{term.email}</td>
                    <td className="p-4">
                      <span className="inline-block bg-muted px-2 py-1 rounded text-xs font-medium capitalize">
                        {term.mode}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-green-700">
                      {term.mode === 'percentage' ? `${term.value}%` : formatPrice(term.value)}
                    </td>
                    <td className="p-4 text-right">
                      <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={() => handleEditClick(term)}>
                        <Edit2 className="w-3.5 h-3.5" /> Edit Rule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-muted-foreground" />
          Partner Terms (Payable Commissions)
        </h3>
        
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                  <th className="p-4 font-bold">Partner Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Rule Type</th>
                  <th className="p-4 font-bold">Commission Value</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                  </tr>
                ) : partnerTerms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No partners found.</td>
                  </tr>
                ) : partnerTerms.map(term => (
                  <tr key={term.userId} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 font-bold text-secondary text-sm">{term.name}</td>
                    <td className="p-4 text-sm text-muted-foreground">{term.email}</td>
                    <td className="p-4">
                      <span className="inline-block bg-muted px-2 py-1 rounded text-xs font-medium capitalize">
                        {term.mode}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-amber-700">
                      {term.mode === 'percentage' ? `${term.value}%` : formatPrice(term.value)}
                    </td>
                    <td className="p-4 text-right">
                      <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={() => handleEditClick(term)}>
                        <Edit2 className="w-3.5 h-3.5" /> Edit Rule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commercial Terms</DialogTitle>
            <DialogDescription>
              Update the commission rules for {editingTerm?.name}.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSave} className="space-y-6 pt-4">
            <div>
              <label className="text-sm font-bold text-secondary mb-2 block">Commission Type</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`border rounded-xl p-4 cursor-pointer flex flex-col gap-1 items-center justify-center transition-all ${form.mode === 'percentage' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50'}`}>
                  <input 
                    type="radio" 
                    name="mode" 
                    value="percentage" 
                    className="sr-only"
                    checked={form.mode === 'percentage'} 
                    onChange={() => setForm({ ...form, mode: 'percentage' })}
                  />
                  <span className="font-bold text-secondary">Percentage</span>
                  <span className="text-xs text-muted-foreground">% of booking total</span>
                </label>
                <label className={`border rounded-xl p-4 cursor-pointer flex flex-col gap-1 items-center justify-center transition-all ${form.mode === 'fixed' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50'}`}>
                  <input 
                    type="radio" 
                    name="mode" 
                    value="fixed" 
                    className="sr-only"
                    checked={form.mode === 'fixed'} 
                    onChange={() => setForm({ ...form, mode: 'fixed' })}
                  />
                  <span className="font-bold text-secondary">Fixed Rate</span>
                  <span className="text-xs text-muted-foreground">Flat ₹ per booking</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">
                {form.mode === 'percentage' ? 'Percentage (%)' : 'Fixed Amount (₹)'}
              </label>
              <Input 
                type="number" 
                required 
                min="0"
                step={form.mode === 'percentage' ? "0.1" : "1"}
                max={form.mode === 'percentage' ? "100" : undefined}
                value={form.value} 
                onChange={(e) => setForm({ ...form, value: e.target.value })} 
                className="h-12 text-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertTerms.isPending}>
                {upsertTerms.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Terms
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
