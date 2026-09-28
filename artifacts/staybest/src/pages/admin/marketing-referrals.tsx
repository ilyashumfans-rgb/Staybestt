import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { MarketingNav } from "@/components/admin/MarketingNav";
import { 
  useListReferralPrograms, 
  useCreateReferralProgram, 
  useUpdateReferralProgram,
  getListReferralProgramsQueryKey,
  useListAdminReferralRewards,
  getListAdminReferralRewardsQueryKey,
  useTransitionReferralReward,
  useListAdminOffices,
  useListAdminReferralAttributions,
  getListAdminReferralAttributionsQueryKey,
  useListMarketingTeams,
  getListMarketingTeamsQueryKey,
  useTransitionReferral
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Gift, Edit2, ShieldAlert, CheckCircle, RefreshCcw, XCircle, Filter, Link as LinkIcon, Gift as GiftIcon, HandCoins } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const emptyProgramForm = {
  name: "",
  referrerReward: "",
  refereeReward: "",
  active: true,
  officeId: "",
  teamId: "",
};

export default function AdminMarketingReferrals() {
  const queryClient = useQueryClient();
  const { data: programs, isLoading: programsLoading } = useListReferralPrograms({
    query: { queryKey: getListReferralProgramsQueryKey() }
  });
  
  const { data: offices } = useListAdminOffices();
  const { data: marketingTeams } = useListMarketingTeams({
    query: { queryKey: getListMarketingTeamsQueryKey() },
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: rewards, isLoading: rewardsLoading } = useListAdminReferralRewards(
    statusFilter !== "all" ? { status: statusFilter } : undefined,
    { query: { queryKey: getListAdminReferralRewardsQueryKey(statusFilter !== "all" ? { status: statusFilter } : undefined) } }
  );

  const { data: attributions, isLoading: attributionsLoading } = useListAdminReferralAttributions(
    undefined,
    { query: { queryKey: getListAdminReferralAttributionsQueryKey() } }
  );

  const createProgram = useCreateReferralProgram();
  const updateProgram = useUpdateReferralProgram();
  const transitionReward = useTransitionReferralReward();
  const transitionAttribution = useTransitionReferral();

  const [isProgramOpen, setIsProgramOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [programForm, setProgramForm] = useState(emptyProgramForm);

  const resetProgramForm = () => {
    setProgramForm(emptyProgramForm);
    setEditingProgramId(null);
  };

  const handleEditProgram = (p: any) => {
    setProgramForm({
      name: p.name,
      referrerReward: String(p.referrerReward),
      refereeReward: String(p.refereeReward),
      active: p.active,
      officeId: p.officeId ? String(p.officeId) : "",
      teamId: p.teamId ? String(p.teamId) : "",
    });
    setEditingProgramId(p.id);
    setIsProgramOpen(true);
  };

  const handleProgramSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!programForm.name.trim() || Number(programForm.referrerReward) < 0 || Number(programForm.refereeReward) < 0) {
      toast.error("Please provide valid reward amounts");
      return;
    }
    
    const payload = {
      name: programForm.name.trim(),
      referrerReward: Number(programForm.referrerReward),
      refereeReward: Number(programForm.refereeReward),
      active: programForm.active,
      officeId: programForm.officeId ? Number(programForm.officeId) : null,
      teamId: programForm.teamId ? Number(programForm.teamId) : null,
    };
    
    const opts = {
      onSuccess: () => {
        toast.success(editingProgramId ? "Program updated" : "Program created");
        queryClient.invalidateQueries({ queryKey: getListReferralProgramsQueryKey() });
        setIsProgramOpen(false);
        resetProgramForm();
      },
      onError: (err: any) => toast.error(err.message || "Failed to save program"),
    };

    if (editingProgramId) updateProgram.mutate({ id: editingProgramId, data: payload }, opts);
    else createProgram.mutate({ data: payload }, opts);
  };

  const handleAttributionTransition = (id: number, newStatus: "qualified" | "rejected" | "rewarded") => {
    transitionAttribution.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        toast.success(`Attribution marked as ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getListAdminReferralAttributionsQueryKey() });
        if (newStatus === "rewarded") {
          queryClient.invalidateQueries({ queryKey: getListAdminReferralRewardsQueryKey() });
        }
      },
      onError: (err: any) => toast.error(err.message || "Failed to transition attribution"),
    });
  };

  const handleTransition = (id: number, newStatus: "approved" | "fulfilled" | "rejected" | "reversed") => {
    transitionReward.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        toast.success(`Reward marked as ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getListAdminReferralRewardsQueryKey() });
      },
      onError: (err: any) => toast.error(err.message || "Failed to transition reward"),
    });
  };

  return (
    <AdminLayout title="Marketing Hub">
      <MarketingNav />
      <Tabs defaultValue="programs" className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList>
            <TabsTrigger value="programs">Referral Programs</TabsTrigger>
            <TabsTrigger value="attributions">Attributions</TabsTrigger>
            <TabsTrigger value="ledger">Reward Ledger</TabsTrigger>
          </TabsList>
          
          <Button onClick={() => { resetProgramForm(); setIsProgramOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> New Program
          </Button>
        </div>

        <TabsContent value="programs">
          {programsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !programs || programs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No Referral Programs</h3>
              <p className="text-sm text-muted-foreground">Create a program to reward users for inviting friends.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-6 py-3 font-bold text-secondary">Program Name</th>
                    <th className="px-6 py-3 font-bold text-secondary">Referrer Reward</th>
                    <th className="px-6 py-3 font-bold text-secondary">Referee Reward</th>
                    <th className="px-6 py-3 font-bold text-secondary">Target Office/Team</th>
                    <th className="px-6 py-3 font-bold text-secondary">Status</th>
                    <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-bold text-secondary">{p.name}</td>
                      <td className="px-6 py-4">{formatPrice(p.referrerReward)}</td>
                      <td className="px-6 py-4">{formatPrice(p.refereeReward)}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div>{p.officeId && offices ? offices.find(o => o.id === p.officeId)?.name || p.officeId : "Global"}</div>
                        {p.teamId && marketingTeams && <div className="text-xs">{marketingTeams.find(mt => mt.id === p.teamId)?.name}</div>}
                      </td>
                      <td className="px-6 py-4">
                        {p.active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEditProgram(p)}><Edit2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attributions">
          {attributionsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !attributions || attributions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <LinkIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No Attributions Yet</h3>
              <p className="text-sm text-muted-foreground">When users refer friends, the links will show up here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-6 py-3 font-bold text-secondary">ID</th>
                    <th className="px-6 py-3 font-bold text-secondary">Code ID</th>
                    <th className="px-6 py-3 font-bold text-secondary">Referee User</th>
                    <th className="px-6 py-3 font-bold text-secondary">Booking Event</th>
                    <th className="px-6 py-3 font-bold text-secondary">Status</th>
                    <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attributions.map((a: any) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-mono text-muted-foreground">#{a.id}</td>
                      <td className="px-6 py-4">Code #{a.codeId}</td>
                      <td className="px-6 py-4">{a.refereeUserId}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.bookingId ? `Booking #${a.bookingId}` : "None"}</td>
                      <td className="px-6 py-4 capitalize">
                        <Badge variant={a.status === "completed" || a.status === "rewarded" ? "default" : "secondary"}>{a.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {a.status === "pending" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleAttributionTransition(a.id, "qualified")} title="Mark Qualified">
                                <CheckCircle className="w-4 h-4 text-green-600 mr-1" /> Qualified
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleAttributionTransition(a.id, "rejected")} title="Reject">
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {a.status === "qualified" && (
                            <>
                              <Button variant="outline" size="sm" className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" onClick={() => handleAttributionTransition(a.id, "rewarded")} title="Create Reward">
                                <GiftIcon className="w-4 h-4 mr-2" /> Create Reward
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleAttributionTransition(a.id, "rejected")} title="Reject">
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
          )}
        </TabsContent>

        <TabsContent value="ledger">
          <div className="flex items-center gap-3 mb-6 bg-white p-3 rounded-xl border border-border">
            <Filter className="w-4 h-4 text-muted-foreground ml-2" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm outline-none font-medium text-secondary"
            >
              <option value="all">All Rewards</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="rejected">Rejected</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>

          {rewardsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !rewards || rewards.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No Rewards Found</h3>
              <p className="text-sm text-muted-foreground">There are no referral rewards matching this filter.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-6 py-3 font-bold text-secondary">Reward ID</th>
                    <th className="px-6 py-3 font-bold text-secondary">Type</th>
                    <th className="px-6 py-3 font-bold text-secondary">Amount</th>
                    <th className="px-6 py-3 font-bold text-secondary">Created</th>
                    <th className="px-6 py-3 font-bold text-secondary">Status</th>
                    <th className="px-6 py-3 font-bold text-secondary text-right">Manual Fulfillment</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-mono text-muted-foreground">#{r.id}</td>
                      <td className="px-6 py-4 capitalize">{r.rewardType}</td>
                      <td className="px-6 py-4 font-bold text-secondary">{formatPrice(r.amount)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="capitalize">{r.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === "pending" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleTransition(r.id, "approved")} title="Approve">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleTransition(r.id, "rejected")} title="Reject">
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <Button variant="outline" size="sm" className="bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200" onClick={() => handleTransition(r.id, "fulfilled")} title="Mark as Fulfilled">
                              <HandCoins className="w-4 h-4 mr-2" /> Fulfill
                            </Button>
                          )}
                          {r.status === "fulfilled" && (
                            <Button variant="ghost" size="sm" onClick={() => handleTransition(r.id, "reversed")} title="Reverse Reward">
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isProgramOpen} onOpenChange={(open) => { setIsProgramOpen(open); if (!open) resetProgramForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProgramId ? "Edit Referral Program" : "New Referral Program"}</DialogTitle></DialogHeader>
          <form onSubmit={handleProgramSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Program Name *</label>
              <Input required value={programForm.name} onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Referrer Reward (₹) *</label>
                <Input required type="number" min="0" value={programForm.referrerReward} onChange={(e) => setProgramForm({ ...programForm, referrerReward: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Referee Reward (₹) *</label>
                <Input required type="number" min="0" value={programForm.refereeReward} onChange={(e) => setProgramForm({ ...programForm, refereeReward: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Office / Region</label>
                <select
                  value={programForm.officeId}
                  onChange={(e) => setProgramForm({ ...programForm, officeId: e.target.value, teamId: "" })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  <option value="">Global (All Offices)</option>
                  {offices?.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Team</label>
                <select
                  value={programForm.teamId}
                  onChange={(e) => setProgramForm({ ...programForm, teamId: e.target.value })}
                  className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  disabled={!programForm.officeId}
                >
                  <option value="">Global (All Teams)</option>
                  {marketingTeams?.filter(mt => mt.active && mt.officeId === Number(programForm.officeId)).map(mt => (
                    <option key={mt.id} value={mt.id}>{mt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={programForm.active} onChange={(e) => setProgramForm({ ...programForm, active: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setIsProgramOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createProgram.isPending || updateProgram.isPending}>Save Program</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
