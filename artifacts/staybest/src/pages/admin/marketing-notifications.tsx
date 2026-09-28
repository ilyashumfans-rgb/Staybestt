import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { MarketingNav } from "@/components/admin/MarketingNav";
import {
  useListCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDuplicateCampaign,
  useCancelCampaign,
  useSendCampaign,
  getListCampaignsQueryKey,
  useGetCampaignDeliverySummary,
  useListAdminOffices,
  useListMarketingTeams,
  getListMarketingTeamsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send, Megaphone, Edit2, Copy, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const emptyForm = {
  title: "",
  body: "",
  audience: "all" as "all" | "customer" | "agent" | "partner",
  scheduledAt: "",
  officeId: "",
  teamId: "",
};

function DeliverySummary({ campaignId }: { campaignId: number }) {
  const { data: summary, isLoading } = useGetCampaignDeliverySummary(campaignId);

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (!summary) return <span className="text-muted-foreground text-xs">No data</span>;

  return (
    <div className="flex gap-4 text-xs mt-2 text-muted-foreground">
      <span className="font-medium text-secondary">Sent: {summary.sent}</span>
      <span>Opened: {summary.opened}</span>
      <span>Read: {summary.read}</span>
      {summary.failed > 0 && <span className="text-red-600">Failed: {summary.failed}</span>}
    </div>
  );
}

export default function AdminMarketingNotifications() {
  const queryClient = useQueryClient();
  const { data: campaigns, isLoading } = useListCampaigns({
    query: { queryKey: getListCampaignsQueryKey() },
  });
  
  const { data: offices } = useListAdminOffices();
  const { data: marketingTeams } = useListMarketingTeams({
    query: { queryKey: getListMarketingTeamsQueryKey() },
  });

  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const duplicateCampaign = useDuplicateCampaign();
  const cancelCampaign = useCancelCampaign();
  const sendCampaign = useSendCampaign();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (c: any) => {
    setFormData({
      title: c.title,
      body: c.body,
      audience: c.audience,
      scheduledAt: c.scheduledAt ? c.scheduledAt.slice(0, 16) : "",
      officeId: c.officeId ? String(c.officeId) : "",
      teamId: c.teamId ? String(c.teamId) : "",
    });
    setEditingId(c.id);
    setIsDialogOpen(true);
  };

  const handleDuplicate = (id: number) => {
    duplicateCampaign.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Campaign duplicated");
          refresh();
        },
        onError: (err: any) => toast.error(err.message || "Failed to duplicate campaign"),
      }
    );
  };

  const handleCancel = (id: number) => {
    if (confirm("Are you sure you want to cancel this campaign?")) {
      cancelCampaign.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success("Campaign cancelled");
            refresh();
          },
          onError: (err: any) => toast.error(err.message || "Failed to cancel campaign"),
        }
      );
    }
  };

  const handleSend = (id: number) => {
    if (confirm("Are you sure you want to send this notification now?")) {
      sendCampaign.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success("Notification sent!");
            refresh();
          },
          onError: (err: any) => toast.error(err.message || "Failed to send notification"),
        },
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.body.trim()) {
      toast.error("Please enter a title and body");
      return;
    }
    const payload = {
      title: formData.title.trim(),
      body: formData.body.trim(),
      audience: formData.audience,
      scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
      officeId: formData.officeId ? Number(formData.officeId) : null,
      teamId: formData.teamId ? Number(formData.teamId) : null,
    };
    
    const opts = {
      onSuccess: () => {
        toast.success(editingId ? "Campaign updated" : "Notification campaign created");
        setIsDialogOpen(false);
        resetForm();
        refresh();
      },
      onError: (err: any) => toast.error(err.message || "Failed to save campaign"),
    };

    if (editingId) {
      updateCampaign.mutate({ id: editingId, data: payload }, opts);
    } else {
      createCampaign.mutate({ data: payload }, opts);
    }
  };

  const isSaving = createCampaign.isPending || updateCampaign.isPending;

  return (
    <AdminLayout title="Marketing Hub">
      <MarketingNav />
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground">
          Create and manage push notifications sent to your users' devices.
        </p>
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> New Notification
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-border">
          <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-bold text-secondary mb-1">No notifications yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first notification campaign to engage your users.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-6 py-3 font-bold text-secondary">Title & Summary</th>
                  <th className="px-6 py-3 font-bold text-secondary">Target</th>
                  <th className="px-6 py-3 font-bold text-secondary">Scheduled</th>
                  <th className="px-6 py-3 font-bold text-secondary">Status</th>
                  <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <p className="font-bold text-secondary">{c.title}</p>
                      <p className="text-muted-foreground truncate max-w-[200px]">{c.body}</p>
                      {(c.status === "sent" || c.status === "failed") && (
                        <DeliverySummary campaignId={c.id} />
                      )}
                    </td>
                    <td className="px-6 py-4 capitalize">
                      <div>{c.audience}</div>
                      {(c.officeId || c.teamId) && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {c.officeId && offices?.find(o => o.id === c.officeId)?.name}
                          {c.officeId && c.teamId && " - "}
                          {c.teamId && marketingTeams?.find(t => t.id === c.teamId)?.name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : "Manual"}
                    </td>
                    <td className="px-6 py-4">
                      {c.status === "sent" ? (
                        <Badge className="bg-green-100 text-green-800">Sent</Badge>
                      ) : c.status === "cancelled" ? (
                        <Badge variant="destructive">Cancelled</Badge>
                      ) : (
                        <Badge variant="secondary" className="capitalize">{c.status}</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Duplicate"
                          onClick={() => handleDuplicate(c.id)}
                          disabled={duplicateCampaign.isPending}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit"
                              onClick={() => handleEdit(c)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Send Now"
                              onClick={() => handleSend(c.id)}
                              disabled={sendCampaign.isPending}
                            >
                              <Send className="w-4 h-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Cancel"
                              onClick={() => handleCancel(c.id)}
                              disabled={cancelCampaign.isPending}
                            >
                              <XCircle className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
            <DialogTitle>{editingId ? "Edit Campaign" : "New Notification Campaign"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Title *</label>
              <Input
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Special Weekend Offer!"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Body *</label>
              <textarea
                required
                rows={3}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Get 20% off all prime properties this weekend..."
                className="w-full border border-input rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Audience *</label>
              <select
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value as any })}
                className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
              >
                <option value="all">Everyone</option>
                <option value="customer">Customers Only</option>
                <option value="agent">Agents Only</option>
                <option value="partner">Partners Only</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Office / Region</label>
                <select
                  value={formData.officeId}
                  onChange={(e) => setFormData({ ...formData, officeId: e.target.value, teamId: "" })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  <option value="">All Offices</option>
                  {offices?.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Team</label>
                <select
                  value={formData.teamId}
                  onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  disabled={!formData.officeId}
                >
                  <option value="">All Teams</option>
                  {marketingTeams?.filter(mt => mt.active && mt.officeId === Number(formData.officeId)).map(mt => (
                    <option key={mt.id} value={mt.id}>{mt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Scheduled Time</label>
              <Input
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingId ? "Save Changes" : "Create Campaign"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
