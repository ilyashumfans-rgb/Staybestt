import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { MarketingNav } from "@/components/admin/MarketingNav";
import {
  useListAdminOffices,
  useCreateOffice,
  useUpdateOffice,
  useDeleteOffice,
  getListAdminOfficesQueryKey,
  useListMarketingTeams,
  useCreateMarketingTeam,
  useUpdateMarketingTeam,
  useDeleteMarketingTeam,
  getListMarketingTeamsQueryKey,
  useListTeamAssignments,
  useCreateTeamAssignment,
  useUpdateTeamAssignment,
  useDeactivateTeamAssignment,
  getListTeamAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Edit2, Trash2, Building, Users, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OfficeRow = {
  id: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state?: string | null;
  country: string;
  phone?: string | null;
  email?: string | null;
};

const emptyOfficeForm = {
  name: "",
  code: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  phone: "",
  email: "",
};

const emptyMarketingTeamForm = {
  officeId: "",
  name: "",
  description: "",
  active: true,
};

const emptyTeamForm = {
  userId: "",
  officeId: "",
  teamId: "",
  title: "",
  managerUserId: "",
  active: true,
};

export default function AdminMarketingOffices() {
  const queryClient = useQueryClient();
  const { data: offices, isLoading: officesLoading } = useListAdminOffices({
    query: { queryKey: getListAdminOfficesQueryKey() },
  });
  
  const { data: marketingTeams, isLoading: marketingTeamsLoading } = useListMarketingTeams({
    query: { queryKey: getListMarketingTeamsQueryKey() },
  });

  const { data: teams, isLoading: teamsLoading } = useListTeamAssignments({
    query: { queryKey: getListTeamAssignmentsQueryKey() },
  });

  const createOffice = useCreateOffice();
  const updateOffice = useUpdateOffice();
  const deleteOffice = useDeleteOffice();
  
  const createMarketingTeam = useCreateMarketingTeam();
  const updateMarketingTeam = useUpdateMarketingTeam();
  const deleteMarketingTeam = useDeleteMarketingTeam();

  const createTeam = useCreateTeamAssignment();
  const updateTeam = useUpdateTeamAssignment();
  const deactivateTeam = useDeactivateTeamAssignment();

  const [isOfficeOpen, setIsOfficeOpen] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState<number | null>(null);
  const [officeForm, setOfficeForm] = useState(emptyOfficeForm);
  
  const [isMarketingTeamOpen, setIsMarketingTeamOpen] = useState(false);
  const [editingMarketingTeamId, setEditingMarketingTeamId] = useState<number | null>(null);
  const [marketingTeamForm, setMarketingTeamForm] = useState(emptyMarketingTeamForm);
  
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [teamForm, setTeamForm] = useState(emptyTeamForm);

  const resetOfficeForm = () => {
    setOfficeForm(emptyOfficeForm);
    setEditingOfficeId(null);
  };
  
  const resetMarketingTeamForm = () => {
    setMarketingTeamForm(emptyMarketingTeamForm);
    setEditingMarketingTeamId(null);
  };
  
  const resetTeamForm = () => {
    setTeamForm(emptyTeamForm);
    setEditingTeamId(null);
  };

  const handleEditOffice = (o: OfficeRow) => {
    setOfficeForm({
      name: o.name,
      code: o.code,
      address: o.address,
      city: o.city,
      state: o.state ?? "",
      country: o.country,
      phone: o.phone ?? "",
      email: o.email ?? "",
    });
    setEditingOfficeId(o.id);
    setIsOfficeOpen(true);
  };

  const handleEditMarketingTeam = (mt: any) => {
    setMarketingTeamForm({
      officeId: String(mt.officeId),
      name: mt.name,
      description: mt.description ?? "",
      active: mt.active,
    });
    setEditingMarketingTeamId(mt.id);
    setIsMarketingTeamOpen(true);
  };

  const handleEditTeam = (t: any) => {
    setTeamForm({
      userId: t.userId,
      officeId: String(t.officeId),
      teamId: String(t.teamId),
      title: t.title ?? "",
      managerUserId: t.managerUserId ?? "",
      active: t.active ?? true,
    });
    setEditingTeamId(t.id);
    setIsTeamOpen(true);
  };

  const handleDeleteOffice = (id: number) => {
    if (confirm("Are you sure you want to delete this office?")) {
      deleteOffice.mutate({ id }, {
        onSuccess: () => {
          toast.success("Office deleted");
          queryClient.invalidateQueries({ queryKey: getListAdminOfficesQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to delete office"),
      });
    }
  };
  
  const handleDeleteMarketingTeam = (id: number) => {
    if (confirm("Are you sure you want to delete this marketing team?")) {
      deleteMarketingTeam.mutate({ id }, {
        onSuccess: () => {
          toast.success("Marketing Team deleted");
          queryClient.invalidateQueries({ queryKey: getListMarketingTeamsQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to delete marketing team"),
      });
    }
  };

  const handleDeactivateTeam = (id: number) => {
    if (confirm("Are you sure you want to deactivate this assignment?")) {
      deactivateTeam.mutate({ id }, {
        onSuccess: () => {
          toast.success("Team assignment deactivated");
          queryClient.invalidateQueries({ queryKey: getListTeamAssignmentsQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to deactivate team assignment"),
      });
    }
  };

  const handleOfficeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeForm.name.trim() || !officeForm.city.trim()) {
      toast.error("Enter office name and city");
      return;
    }
    const payload = {
      name: officeForm.name.trim(),
      code: officeForm.code.trim().toUpperCase(),
      address: officeForm.address.trim(),
      city: officeForm.city.trim(),
      state: officeForm.state.trim() || null,
      country: officeForm.country.trim(),
      phone: officeForm.phone.trim() || null,
      email: officeForm.email.trim() || null,
    };

    const opts = {
      onSuccess: () => {
        toast.success(editingOfficeId ? "Office updated" : "Office created");
        setIsOfficeOpen(false);
        resetOfficeForm();
        queryClient.invalidateQueries({ queryKey: getListAdminOfficesQueryKey() });
      },
      onError: (err: any) => toast.error(err.message || "Failed to save office"),
    };

    if (editingOfficeId) updateOffice.mutate({ id: editingOfficeId, data: payload }, opts);
    else createOffice.mutate({ data: payload }, opts);
  };
  
  const handleMarketingTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketingTeamForm.name.trim() || !marketingTeamForm.officeId) {
      toast.error("Enter a name and select an office");
      return;
    }
    const payload = {
      officeId: Number(marketingTeamForm.officeId),
      name: marketingTeamForm.name.trim(),
      description: marketingTeamForm.description.trim() || null,
      active: marketingTeamForm.active,
    };

    const opts = {
      onSuccess: () => {
        toast.success(editingMarketingTeamId ? "Marketing Team updated" : "Marketing Team created");
        setIsMarketingTeamOpen(false);
        resetMarketingTeamForm();
        queryClient.invalidateQueries({ queryKey: getListMarketingTeamsQueryKey() });
      },
      onError: (err: any) => toast.error(err.message || "Failed to save marketing team"),
    };

    if (editingMarketingTeamId) updateMarketingTeam.mutate({ id: editingMarketingTeamId, data: payload }, opts);
    else createMarketingTeam.mutate({ data: payload }, opts);
  };

  const handleTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamForm.userId.trim() || !teamForm.officeId || !teamForm.teamId) {
      toast.error("User ID, Office, and Team are required");
      return;
    }
    
    const payload = {
      userId: teamForm.userId.trim(),
      officeId: Number(teamForm.officeId),
      teamId: Number(teamForm.teamId),
      title: teamForm.title.trim() || null,
      managerUserId: teamForm.managerUserId.trim() || null,
      active: teamForm.active,
    };

    const opts = {
      onSuccess: () => {
        toast.success(editingTeamId ? "Team assignment updated" : "Team assignment created");
        setIsTeamOpen(false);
        resetTeamForm();
        queryClient.invalidateQueries({ queryKey: getListTeamAssignmentsQueryKey() });
      },
      onError: (err: any) => toast.error(err.message || "Failed to save team assignment"),
    };

    if (editingTeamId) updateTeam.mutate({ id: editingTeamId, data: payload }, opts);
    else createTeam.mutate({ data: payload }, opts);
  };

  return (
    <AdminLayout title="Marketing Hub">
      <MarketingNav />
      <Tabs defaultValue="offices" className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList>
            <TabsTrigger value="offices">Offices</TabsTrigger>
            <TabsTrigger value="marketing-teams">Marketing Teams</TabsTrigger>
            <TabsTrigger value="teams">Team Assignments</TabsTrigger>
          </TabsList>
          <div>
            <Button onClick={() => { resetOfficeForm(); setIsOfficeOpen(true); }} className="mr-2 hidden md:inline-flex" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> New Office
            </Button>
            <Button onClick={() => { resetMarketingTeamForm(); setIsMarketingTeamOpen(true); }} className="mr-2 hidden md:inline-flex" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> New Team
            </Button>
            <Button onClick={() => { resetTeamForm(); setIsTeamOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Assignment
            </Button>
          </div>
        </div>

        <TabsContent value="offices">
          {officesLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !offices || offices.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No offices listed</h3>
              <p className="text-sm text-muted-foreground">Add regional offices so customers and partners can reach you locally.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {offices.map((o) => (
                <div key={o.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-secondary text-lg">{o.name}</h3>
                        <p className="text-sm text-muted-foreground font-mono">{o.code}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditOffice(o)} className="h-8 w-8 p-0">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteOffice(o.id)} className="h-8 w-8 p-0 text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-secondary">
                      <p>{o.address}, {o.city} {o.state ? `, ${o.state}` : ''}, {o.country}</p>
                      {o.phone && <p><strong>Phone:</strong> {o.phone}</p>}
                      {o.email && <p><strong>Email:</strong> {o.email}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="marketing-teams">
          {marketingTeamsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !marketingTeams || marketingTeams.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No Marketing Teams</h3>
              <p className="text-sm text-muted-foreground">Create teams within your offices to manage marketing tasks.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-6 py-3 font-bold text-secondary">Name</th>
                    <th className="px-6 py-3 font-bold text-secondary">Office</th>
                    <th className="px-6 py-3 font-bold text-secondary">Description</th>
                    <th className="px-6 py-3 font-bold text-secondary">Status</th>
                    <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {marketingTeams.map((mt) => (
                    <tr key={mt.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-bold text-secondary">{mt.name}</td>
                      <td className="px-6 py-4">{offices?.find(o => o.id === mt.officeId)?.name || `Office ${mt.officeId}`}</td>
                      <td className="px-6 py-4 text-muted-foreground">{mt.description || "—"}</td>
                      <td className="px-6 py-4">
                        {mt.active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditMarketingTeam(mt)}><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteMarketingTeam(mt.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="teams">
          {teamsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !teams || teams.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-border">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-secondary mb-1">No Team Assignments</h3>
              <p className="text-sm text-muted-foreground">Assign employees to offices and regional teams.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-6 py-3 font-bold text-secondary">User ID</th>
                    <th className="px-6 py-3 font-bold text-secondary">Office</th>
                    <th className="px-6 py-3 font-bold text-secondary">Team Name</th>
                    <th className="px-6 py-3 font-bold text-secondary">Title</th>
                    <th className="px-6 py-3 font-bold text-secondary">Status</th>
                    <th className="px-6 py-3 font-bold text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4 font-mono text-muted-foreground">{t.userId}</td>
                      <td className="px-6 py-4">{offices?.find(o => o.id === t.officeId)?.name || `Office ${t.officeId}`}</td>
                      <td className="px-6 py-4 font-bold text-secondary">{t.teamName || (marketingTeams?.find(mt => mt.id === t.teamId)?.name)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{t.title || "—"}</td>
                      <td className="px-6 py-4">
                        {t.active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditTeam(t)}><Edit2 className="w-4 h-4" /></Button>
                          {t.active && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeactivateTeam(t.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
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

      <Dialog open={isOfficeOpen} onOpenChange={(open) => { setIsOfficeOpen(open); if (!open) resetOfficeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingOfficeId ? "Edit Office" : "New Office"}</DialogTitle></DialogHeader>
          <form onSubmit={handleOfficeSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">Office Name *</label><Input required value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} placeholder="HQ - Mumbai" /></div>
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">Code *</label><Input required value={officeForm.code} onChange={(e) => setOfficeForm({ ...officeForm, code: e.target.value.toUpperCase() })} placeholder="BOM" className="uppercase" /></div>
            </div>
            <div><label className="text-sm font-bold text-secondary mb-1.5 block">Street Address *</label><Input required value={officeForm.address} onChange={(e) => setOfficeForm({ ...officeForm, address: e.target.value })} placeholder="123 Corporate Park, Main Road" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">City *</label><Input required value={officeForm.city} onChange={(e) => setOfficeForm({ ...officeForm, city: e.target.value })} placeholder="Mumbai" /></div>
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">State</label><Input value={officeForm.state} onChange={(e) => setOfficeForm({ ...officeForm, state: e.target.value })} placeholder="Maharashtra" /></div>
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">Country *</label><Input required value={officeForm.country} onChange={(e) => setOfficeForm({ ...officeForm, country: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">Phone</label><Input value={officeForm.phone} onChange={(e) => setOfficeForm({ ...officeForm, phone: e.target.value })} placeholder="+91 12345 67890" /></div>
              <div><label className="text-sm font-bold text-secondary mb-1.5 block">Email</label><Input type="email" value={officeForm.email} onChange={(e) => setOfficeForm({ ...officeForm, email: e.target.value })} placeholder="mumbai@staybest.com" /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsOfficeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createOffice.isPending || updateOffice.isPending}>{editingOfficeId ? "Save Changes" : "Create Office"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isMarketingTeamOpen} onOpenChange={(open) => { setIsMarketingTeamOpen(open); if (!open) resetMarketingTeamForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingMarketingTeamId ? "Edit Marketing Team" : "New Marketing Team"}</DialogTitle></DialogHeader>
          <form onSubmit={handleMarketingTeamSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Office *</label>
              <select required value={marketingTeamForm.officeId} onChange={(e) => setMarketingTeamForm({ ...marketingTeamForm, officeId: e.target.value })} className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm">
                <option value="">Select Office</option>
                {offices?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Team Name *</label>
              <Input required value={marketingTeamForm.name} onChange={(e) => setMarketingTeamForm({ ...marketingTeamForm, name: e.target.value })} placeholder="E.g. Performance Marketing" />
            </div>
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">Description</label>
              <Input value={marketingTeamForm.description} onChange={(e) => setMarketingTeamForm({ ...marketingTeamForm, description: e.target.value })} placeholder="Optional description" />
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={marketingTeamForm.active} onChange={(e) => setMarketingTeamForm({ ...marketingTeamForm, active: e.target.checked })} /> <span className="text-sm font-medium">Active</span></label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsMarketingTeamOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMarketingTeam.isPending || updateMarketingTeam.isPending}>{editingMarketingTeamId ? "Save Changes" : "Create Team"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamOpen} onOpenChange={(open) => { setIsTeamOpen(open); if (!open) resetTeamForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTeamId ? "Edit Team Assignment" : "New Team Assignment"}</DialogTitle></DialogHeader>
          <form onSubmit={handleTeamSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">User ID *</label>
              <Input required value={teamForm.userId} onChange={(e) => setTeamForm({ ...teamForm, userId: e.target.value })} placeholder="user_2XyZ..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Office *</label>
                <select required value={teamForm.officeId} onChange={(e) => setTeamForm({ ...teamForm, officeId: e.target.value, teamId: "" })} className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm">
                  <option value="">Select Office</option>
                  {offices?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Team *</label>
                <select required value={teamForm.teamId} onChange={(e) => setTeamForm({ ...teamForm, teamId: e.target.value })} className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm" disabled={!teamForm.officeId}>
                  <option value="">Select Team</option>
                  {marketingTeams?.filter(mt => mt.active && mt.officeId === Number(teamForm.officeId)).map(mt => (
                    <option key={mt.id} value={mt.id}>{mt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Title / Designation</label>
                <Input value={teamForm.title} onChange={(e) => setTeamForm({ ...teamForm, title: e.target.value })} placeholder="Account Executive" />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1.5 block">Manager User ID</label>
                <Input value={teamForm.managerUserId} onChange={(e) => setTeamForm({ ...teamForm, managerUserId: e.target.value })} placeholder="user_ManagerXYZ..." />
              </div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={teamForm.active} onChange={(e) => setTeamForm({ ...teamForm, active: e.target.checked })} /> <span className="text-sm font-medium">Active</span></label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsTeamOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTeam.isPending || updateTeam.isPending}>{editingTeamId ? "Save Changes" : "Create Assignment"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
