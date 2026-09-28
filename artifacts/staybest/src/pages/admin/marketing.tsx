import { useState } from "react";
import { MarketingNav } from "@/components/admin/MarketingNav";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListAdminCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  getListAdminCouponsQueryKey,
  CouponInputAudience,
  CouponInputType,
  type Coupon,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Edit2, Trash2, TicketPercent, Power } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";

const emptyForm = {
  code: "",
  type: "percent" as "percent" | "flat",
  value: "",
  minAmount: "",
  maxDiscount: "",
  totalUsageLimit: "",
  perUserUsageLimit: "",
  audience: "all" as "all" | "customer" | "agent" | "partner",
  description: "",
  startsAt: "",
  expiresAt: "",
  active: true,
};

export default function AdminMarketing() {
  const queryClient = useQueryClient();
  const { data: coupons, isLoading } = useListAdminCoupons({
    query: { queryKey: getListAdminCouponsQueryKey() },
  });

  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminCouponsQueryKey() });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (c: Coupon) => {
    setFormData({
      code: c.code,
      type: c.type === "flat" ? "flat" : ("percent" as "percent" | "flat"),
      value: String(c.value),
      minAmount: c.minAmount != null ? String(c.minAmount) : "",
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "",
      totalUsageLimit: c.totalUsageLimit != null ? String(c.totalUsageLimit) : "",
      perUserUsageLimit: c.perUserUsageLimit != null ? String(c.perUserUsageLimit) : "",
      audience: (c.audience || "all") as any,
      description: c.description || "",
      startsAt: c.startsAt?.slice(0, 10) || "",
      expiresAt: c.expiresAt?.slice(0, 10) || "",
      active: c.active,
    });
    setEditingId(c.id);
    setIsDialogOpen(true);
  };

  const handleToggleActive = (c: Coupon) => {
    updateCoupon.mutate(
      {
        id: c.id,
        data: {
          code: c.code,
          type: c.type === "flat" ? ("flat" as const) : ("percent" as const),
          value: c.value,
          minAmount: c.minAmount ?? null,
          maxDiscount: c.maxDiscount ?? null,
          totalUsageLimit: c.totalUsageLimit ?? null,
          perUserUsageLimit: c.perUserUsageLimit ?? null,
          audience: c.audience as any,
          description: c.description ?? null,
          startsAt: c.startsAt ?? null,
          expiresAt: c.expiresAt ?? null,
          active: !c.active,
        },
      },
      {
        onSuccess: () => {
          toast.success(c.active ? "Coupon deactivated" : "Coupon activated");
          refresh();
        },
        onError: (err: any) => toast.error(err.message || "Failed to update coupon"),
      },
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this coupon?")) {
      deleteCoupon.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success("Coupon deleted");
            refresh();
          },
          onError: (err: any) => toast.error(err.message || "Failed to delete coupon"),
        },
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(formData.value);
    if (!formData.code.trim() || !value || value <= 0) {
      toast.error("Enter a coupon code and a positive discount value");
      return;
    }
    if (formData.type === "percent" && value > 100) {
      toast.error("Percent discount cannot exceed 100");
      return;
    }
    const payload = {
      code: formData.code.trim().toUpperCase(),
      type: formData.type,
      value,
      minAmount: formData.minAmount ? Number(formData.minAmount) : null,
      maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : null,
      totalUsageLimit: formData.totalUsageLimit ? Number(formData.totalUsageLimit) : null,
      perUserUsageLimit: formData.perUserUsageLimit ? Number(formData.perUserUsageLimit) : null,
      audience: formData.audience,
      description: formData.description.trim() || null,
      startsAt: formData.startsAt || null,
      expiresAt: formData.expiresAt || null,
      active: formData.active,
    };
    const opts = {
      onSuccess: () => {
        toast.success(editingId ? "Coupon updated" : "Coupon created");
        setIsDialogOpen(false);
        resetForm();
        refresh();
      },
      onError: (err: any) => toast.error(err.message || "Failed to save coupon"),
    };
    if (editingId) {
      updateCoupon.mutate({ id: editingId, data: payload }, opts);
    } else {
      createCoupon.mutate({ data: payload }, opts);
    }
  };

  const isSaving = createCoupon.isPending || updateCoupon.isPending;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminLayout title="Marketing Hub">
      <MarketingNav />
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground">
          Create discount codes customers can apply at checkout.
        </p>
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> New Coupon
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !coupons || coupons.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-border">
          <TicketPercent className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-bold text-secondary mb-1">No coupons yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first coupon code to offer discounts at checkout.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-6 py-3 font-bold text-secondary">Code</th>
                  <th className="px-6 py-3 font-bold text-secondary">Discount</th>
                  <th className="px-6 py-3 font-bold text-secondary">Target</th>
                  <th className="px-6 py-3 font-bold text-secondary">Dates</th>
                  <th className="px-6 py-3 font-bold text-secondary">Usage</th>
                  <th className="px-6 py-3 font-bold text-secondary">Status</th>
                  <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired = !!c.expiresAt && c.expiresAt < today;

                  // Usage stats string
                  const remainingText = c.remainingUses === null || c.remainingUses === undefined
                    ? "Unlimited remaining"
                    : `${c.remainingUses} remaining`;

                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-mono font-bold text-secondary">
                        {c.code}
                        {c.description && <p className="text-xs font-sans font-normal text-muted-foreground mt-1 max-w-[150px] truncate" title={c.description}>{c.description}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{c.type === "percent" ? `${c.value}% off` : `${formatPrice(c.value)} off`}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.minAmount != null ? `Min: ${formatPrice(c.minAmount)}` : "No min"}
                          {c.maxDiscount != null ? ` · Max: ${formatPrice(c.maxDiscount)}` : ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-xs font-normal capitalize">Audience: {c.audience || "all"}</Badge>
                        <div className="text-xs text-muted-foreground mt-1">Per User: {c.perUserUsageLimit ?? "∞"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        <div>Start: {c.startsAt?.slice(0, 10) || "—"}</div>
                        <div>End: {c.expiresAt?.slice(0, 10) || "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <span className="block font-medium text-secondary">{c.usedCount} used</span>
                        <span className="text-xs">{remainingText}</span>
                      </td>
                      <td className="px-6 py-4">
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : c.remainingUses === 0 ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Fully Used</Badge>
                        ) : c.active ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={c.active ? "Deactivate" : "Activate"}
                            onClick={() => handleToggleActive(c)}
                            disabled={updateCoupon.isPending}
                          >
                            <Power className={`w-4 h-4 ${c.active ? "text-green-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => handleEdit(c)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete"
                            onClick={() => handleDelete(c.id)}
                            disabled={deleteCoupon.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Coupon" : "New Coupon"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Coupon Code *</label>
                <Input
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME10"
                  className="uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Audience</label>
                <select
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value as any })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  {Object.values(CouponInputAudience).map(aud => (
                    <option key={aud} value={aud}>{aud.charAt(0).toUpperCase() + aud.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Internal note or customer facing description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as "percent" | "flat" })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Flat amount (₹)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">
                  {formData.type === "percent" ? "Percent Off *" : "Amount Off (₹) *"}
                </label>
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={formData.type === "percent" ? 100 : undefined}
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={formData.type === "percent" ? "10" : "500"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Min Booking Amount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.minAmount}
                  onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Max Discount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.maxDiscount}
                  onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                  placeholder="Optional limit"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Start Date</label>
                <Input
                  type="date"
                  value={formData.startsAt}
                  onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Expiry Date</label>
                <Input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Total Usage Limit</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.totalUsageLimit}
                  onChange={(e) => setFormData({ ...formData, totalUsageLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Per-User Limit</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.perUserUsageLimit}
                  onChange={(e) => setFormData({ ...formData, perUserUsageLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="rounded text-primary focus:ring-primary"
              />
              Active
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingId ? "Save Changes" : "Create Coupon"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
