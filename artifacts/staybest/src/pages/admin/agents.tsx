import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListAdminAgents,
  getListAdminAgentsQueryKey,
  useGetAdminAgent,
  getGetAdminAgentQueryKey,
  useSetAdminAgentStatus,
  useSetAdminAgentApproval,
  useReviewAdminAgentProperty,
  useUpsertAdminCommercialTerms,
  useListAdminAgentBookings,
  getListAdminAgentBookingsQueryKey,
  useListAdminAgentLedger,
  getListAdminAgentLedgerQueryKey,
  useListAdminAgentPayouts,
  getListAdminAgentPayoutsQueryKey,
  type AdminAgentSummary,
  type AdminAgentDetail,
  type AgentLifecycleEvent,
  type CommercialTermEvent,
  type PropertyReviewEvent,
  customFetch,
} from "@workspace/api-client-react";
import { AdminAgreementDownloads, type SignedAgreement } from "@/components/property-documents/AdminAgreementDownloads";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ArrowLeft, CheckCircle2, XCircle, Ban, ArrowRight, Wallet, TrendingUp, Filter, AlertCircle, Building2, CalendarCheck, CalendarDays, History, Percent, DollarSign, Clock, Banknote, MapPin, SearchX, Check, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn, formatPrice } from "@/lib/utils";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AdminAgents() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <AdminLayout title={selectedAgentId ? "Agent Details" : "Agent Management"}>
      {selectedAgentId ? (
        <AgentDetail 
          agentId={selectedAgentId} 
          onBack={() => setSelectedAgentId(null)} 
        />
      ) : (
        <AgentList onSelect={setSelectedAgentId} />
      )}
    </AdminLayout>
  );
}

function AgentList({ onSelect }: { onSelect: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [approvalStatus, setApprovalStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  
  const { data, isLoading } = useListAdminAgents(
    { page, limit: 20, query: search || undefined, accountStatus: status as any || undefined, approvalStatus: approvalStatus as any || undefined },
    {
      query: {
        queryKey: getListAdminAgentsQueryKey({ page, limit: 20, query: search, accountStatus: status as any, approvalStatus: approvalStatus as any })
      }
    }
  );

  const summary = data?.summary;
  const agents = data?.items || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <MetricCard title="Total Agents" value={summary.total} icon={<Users className="w-4 h-4" />} />
          <MetricCard title="Pending Approvals" value={summary.pendingApprovals} icon={<Clock className="w-4 h-4" />} highlight={summary.pendingApprovals > 0} />
          <MetricCard title="Pending Properties" value={summary.pendingProperties} icon={<Building2 className="w-4 h-4" />} highlight={summary.pendingProperties > 0} />
          <MetricCard title="Total Attributed" value={summary.attributedBookings} icon={<CalendarCheck className="w-4 h-4" />} />
          <MetricCard title="Commission Pending" value={formatPrice(summary.commissionPending)} icon={<DollarSign className="w-4 h-4" />} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search agents..." 
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-10 px-3 border rounded-md text-sm outline-none focus:border-primary bg-white min-w-[150px]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          className="h-10 px-3 border rounded-md text-sm outline-none focus:border-primary bg-white min-w-[150px]"
          value={approvalStatus}
          onChange={(e) => setApprovalStatus(e.target.value)}
        >
          <option value="">All Approvals</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Directory */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                <th className="p-4 font-bold">Agent</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Approval</th>
                <th className="p-4 font-bold text-right">Properties</th>
                <th className="p-4 font-bold text-right">Bookings</th>
                <th className="p-4 font-bold text-right">Commission</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <SearchX className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No agents found matching your criteria.
                  </td>
                </tr>
              ) : agents.map(agent => (
                <tr key={agent.id} className="hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => onSelect(agent.id)}>
                  <td className="p-4">
                    <div className="font-bold text-secondary">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.email}</div>
                  </td>
                  <td className="p-4">
                    <StatusBadge status={agent.status} />
                  </td>
                  <td className="p-4">
                    <ApprovalBadge status={agent.approvalStatus} />
                  </td>
                  <td className="p-4 text-right">
                    <div className="font-medium text-secondary">{agent.propertyCount}</div>
                    {agent.pendingProperties > 0 && (
                      <div className="text-xs text-orange-600 font-bold">{agent.pendingProperties} pending</div>
                    )}
                  </td>
                  <td className="p-4 text-right font-medium text-secondary">
                    {agent.attributedBookings}
                  </td>
                  <td className="p-4 text-right">
                    <div className="font-medium text-emerald-700">{formatPrice(agent.commissionPaid)} paid</div>
                    {agent.commissionPending > 0 && (
                      <div className="text-xs text-muted-foreground">{formatPrice(agent.commissionPending)} pending</div>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.total > pagination.limit && (
          <div className="p-4 border-t flex justify-between items-center bg-muted/5">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * pagination.limit + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page * pagination.limit >= pagination.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>;
  if (status === 'blocked') return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">Blocked</Badge>;
  return <Badge variant="outline" className="capitalize">{status}</Badge>;
}

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Approved</Badge>;
  if (status === 'pending') return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
  if (status === 'rejected') return <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">Rejected</Badge>;
  return <Badge variant="outline" className="capitalize">{status}</Badge>;
}

function MetricCard({ title, value, icon, highlight = false }: { title: string, value: string | number, icon: React.ReactNode, highlight?: boolean }) {
  return (
    <div className={cn("bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm", highlight && "border-orange-200 bg-orange-50/30")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <div className={cn("text-2xl font-bold text-secondary", highlight && "text-orange-700")}>
        {value}
      </div>
    </div>
  );
}

function AgentDetail({ agentId, onBack }: { agentId: string, onBack: () => void }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [signedAgreements, setSignedAgreements] = useState<(SignedAgreement & { agentId: string })[]>([]);
  const [agreementError, setAgreementError] = useState(false);
  useEffect(() => {
    let live = true;
    setSignedAgreements([]);
    setAgreementError(false);
    customFetch<(SignedAgreement & { agentId: string })[]>("/api/admin/agent-agreement-documents", {
      credentials: "same-origin", responseType: "json",
    }).then(rows => { if (live) setSignedAgreements(rows.filter(row => row.agentId === agentId)); })
      .catch(() => { if (live) setAgreementError(true); });
    return () => { live = false; };
  }, [agentId]);
  
  const { data: agent, isLoading } = useGetAdminAgent(agentId, {
    query: {
      queryKey: getGetAdminAgentQueryKey(agentId),
      enabled: !!agentId
    }
  });

  const updateStatus = useSetAdminAgentStatus();
  const updateApproval = useSetAdminAgentApproval();
  
  const handleStatusChange = (newStatus: 'active' | 'blocked') => {
    if (!agent) return;
    const reason = prompt(`Reason for changing status to ${newStatus}?`);
    if (newStatus === 'blocked' && !reason) {
      toast.error("Reason is required to block an agent");
      return;
    }
    
    updateStatus.mutate({
      id: agentId,
      data: {
        status: newStatus,
        expectedStatus: agent.profile.status as any,
        reason: reason || null
      }
    }, {
      onSuccess: () => {
        toast.success(`Agent status updated to ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
        queryClient.invalidateQueries({ queryKey: getListAdminAgentsQueryKey() });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err.message || "Status update failed");
        if (err?.response?.status === 409) {
          queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
        }
      }
    });
  };

  const handleApprovalChange = (newApproval: 'approved' | 'rejected' | 'pending') => {
    if (!agent) return;
    const reason = prompt(`Reason for ${newApproval}?`);
    if (newApproval === 'rejected' && !reason) {
      toast.error("Reason is required to reject an agent");
      return;
    }
    
    updateApproval.mutate({
      id: agentId,
      data: {
        status: newApproval as any,
        expectedStatus: agent.profile.approvalStatus as any,
        reason: reason || null
      }
    }, {
      onSuccess: () => {
        toast.success(`Agent ${newApproval}`);
        queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
        queryClient.invalidateQueries({ queryKey: getListAdminAgentsQueryKey() });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err.message || "Approval update failed");
        if (err?.response?.status === 409) {
          queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
        }
      }
    });
  };

  if (isLoading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!agent) {
    return <div className="p-12 text-center text-muted-foreground">Agent not found</div>;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'commissions', label: 'Commissions', icon: Percent },
    { id: 'payouts', label: 'Payouts', icon: Banknote },
    { id: 'activity', label: 'Activity', icon: History },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2 -ml-3 mb-2 text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Agents
      </Button>

      <div className="bg-white border rounded-2xl p-6 flex flex-col md:flex-row md:items-start justify-between gap-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
            {agent.profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-secondary">{agent.profile.name}</h2>
            <p className="text-muted-foreground">{agent.profile.email}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <StatusBadge status={agent.profile.status} />
              <ApprovalBadge status={agent.profile.approvalStatus} />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Joined {format(parseISO(agent.profile.createdAt), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-[200px]">
          {agent.profile.approvalStatus === 'pending' && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleApprovalChange('approved')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleApprovalChange('rejected')} className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 gap-2">
                <XCircle className="w-4 h-4" /> Reject
              </Button>
            </div>
          )}
          {agent.profile.approvalStatus === 'rejected' && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleApprovalChange('pending')} className="flex-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-2">
                <Clock className="w-4 h-4" /> Return to Pending
              </Button>
            </div>
          )}
          
          <div className="flex gap-2">
            {agent.profile.status === 'active' ? (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('blocked')} className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 gap-2">
                <Ban className="w-4 h-4" /> Block Account
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('active')} className="flex-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-2">
                <CheckCircle2 className="w-4 h-4" /> Activate
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="bg-white border rounded-xl p-5 space-y-2">
        <h3 className="font-bold">Agent agreements</h3>
        {agreementError && <p className="text-destructive text-sm">Could not load signed agreements.</p>}
        <AdminAgreementDownloads ownerId={agentId} role="agent" properties={agent.properties}
          signed={signedAgreements} />
      </section>

      <div className="border-b flex overflow-x-auto hide-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-secondary hover:border-border"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-4">
        {activeTab === 'overview' && <AgentOverviewTab agent={agent} />}
        {activeTab === 'properties' && <AgentPropertiesTab agent={agent} />}
        {activeTab === 'bookings' && <AgentBookingsTab agentId={agentId} />}
        {activeTab === 'commissions' && <AgentCommissionsTab agent={agent} agentId={agentId} />}
        {activeTab === 'payouts' && <AgentPayoutsTab agentId={agentId} />}
        {activeTab === 'activity' && <AgentActivityTab agent={agent} />}
      </div>
    </div>
  );
}

function AgentOverviewTab({ agent }: { agent: AdminAgentDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            Properties
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Properties</div>
              <div className="text-2xl font-bold">{agent.properties.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Pending Approval</div>
              <div className="text-2xl font-bold text-orange-600">
                {agent.properties.filter(p => p.status === 'pending').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-muted-foreground" />
            Bookings Performance
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Bookings</div>
              <div className="text-2xl font-bold">{agent.bookings?.length || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Value</div>
              <div className="text-2xl font-bold text-emerald-700">{formatPrice(agent.bookings?.reduce((sum, b) => sum + b.totalAmount, 0) || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-muted-foreground" />
          Commission Balances
        </h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
            <span className="text-sm text-muted-foreground">Pending (Future Bookings)</span>
            <span className="font-bold">{formatPrice(agent.balances.pending)}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="text-sm font-medium text-emerald-800">Available for Payout</span>
            <span className="font-bold text-emerald-700">{formatPrice(agent.balances.available)}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
            <span className="text-sm text-muted-foreground">Paid Out</span>
            <span className="font-bold">{formatPrice(agent.balances.paid)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentPropertiesTab({ agent }: { agent: AdminAgentDetail }) {
  const queryClient = useQueryClient();
  const reviewProperty = useReviewAdminAgentProperty();

  const handleReview = (propertyId: number, currentStatus: string, action: 'approved' | 'rejected' | 'active') => {
    const reason = prompt(`Reason for ${action} this property?`);
    if (action === 'rejected' && !reason) {
      toast.error("Reason is required to reject a property");
      return;
    }

    reviewProperty.mutate({
      agentId: agent.profile.id,
      propertyId: propertyId,
      data: {
        status: action as any,
        expectedStatus: currentStatus as any,
        reason: reason || null
      }
    }, {
      onSuccess: () => {
        toast.success(`Property ${action} successfully`);
        queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agent.profile.id) });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err.message || "Failed to update property status");
        if (err?.response?.status === 409) {
          queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agent.profile.id) });
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      {agent.properties.length === 0 ? (
        <div className="text-center p-12 bg-white border rounded-xl">
          <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-secondary">No Properties</h3>
          <p className="text-muted-foreground">This agent hasn't submitted any properties yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agent.properties.map(property => (
            <div key={property.id} className="bg-white border rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-secondary text-lg">{property.name}</h4>
                  <ApprovalBadge status={property.status || 'pending'} />
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
                  <MapPin className="w-3.5 h-3.5" />
                  {property.city}, {property.country}
                </div>
                
                <div className="text-xs space-y-1 mt-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium capitalize">{property.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span><StatusBadge status={property.status || 'pending'} /></span>
                  </div>
                </div>
              </div>
              
              {property.status === 'pending' && (
                <div className="bg-muted/10 p-3 border-t flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleReview(property.id, property.status || 'pending', 'approved')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white min-w-[100px]">
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReview(property.id, property.status || 'pending', 'rejected')} className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 min-w-[100px]">
                    Reject
                  </Button>
                </div>
              )}
              {property.status === 'approved' && (
                <div className="bg-muted/10 p-3 border-t flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleReview(property.id, property.status || 'approved', 'active')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]">
                    Activate
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentBookingsTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  
  const { data, isLoading } = useListAdminAgentBookings(agentId, 
    { page, limit: 15, status: status as any || undefined }, 
    {
      query: {
        queryKey: getListAdminAgentBookingsQueryKey(agentId, { page, limit: 15, status: status as any }),
        enabled: !!agentId
      }
    }
  );

  const bookings = data?.items || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-3 border rounded-xl">
        <div className="text-sm font-medium text-secondary">Attributed Bookings</div>
        <select
          className="h-9 px-3 border rounded-md text-sm outline-none focus:border-primary bg-white min-w-[150px]"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                <th className="p-4 font-bold">Booking Ref</th>
                <th className="p-4 font-bold">Property & Guest</th>
                <th className="p-4 font-bold">Dates</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Total</th>
                <th className="p-4 font-bold text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    No bookings found.
                  </td>
                </tr>
              ) : bookings.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/10 transition-colors">
                   <td className="p-4 font-mono font-medium text-secondary">{bookingReferenceLabel(booking.bookingRef, booking.status)}</td>
                  <td className="p-4">
                    <div className="font-bold text-secondary">{booking.propertyName}</div>
                    <div className="text-xs text-muted-foreground">Guest: {booking.guestName}</div>
                  </td>
                  <td className="p-4 text-muted-foreground whitespace-nowrap">
                    {format(parseISO(booking.checkIn), 'MMM d, yyyy')} - {format(parseISO(booking.checkOut), 'MMM d, yyyy')}
                  </td>
                   <td className="p-4">
                     <Badge variant="outline" className="capitalize">{bookingStatusLabel(booking.status)}</Badge>
                  </td>
                  <td className="p-4 text-right font-medium">
                    {formatPrice(booking.totalAmount)}
                  </td>
                  <td className="p-4 text-right font-bold text-emerald-700">
                    --
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.total > pagination.limit && (
          <div className="p-4 border-t flex justify-between items-center bg-muted/5">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * pagination.limit + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page * pagination.limit >= pagination.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCommissionsTab({ agent, agentId }: { agent: AdminAgentDetail, agentId: string }) {
  const queryClient = useQueryClient();
  const upsertTerms = useUpsertAdminCommercialTerms();
  
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ mode: "percentage" | "fixed", value: string }>({
    mode: "percentage",
    value: "10"
  });

  const handleOpenEdit = () => {
    setForm({
      mode: (agent.commercialTerms?.mode as any) || "percentage",
      value: String(agent.commercialTerms?.value || "10")
    });
    setEditOpen(true);
  };

  const handleSaveTerms = (e: React.FormEvent) => {
    e.preventDefault();
    upsertTerms.mutate({
      userId: agentId,
      data: {
        mode: form.mode as any,
        value: Number(form.value),
        expectedUpdatedAt: agent.commercialTerms?.updatedAt || null
      }
    }, {
      onSuccess: () => {
        toast.success("Commercial terms updated");
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
      },
      onError: (err: any) => {
        if (err?.response?.status === 409) {
          toast.error("Conflict: Terms were updated by another user. Please review and try again.");
          queryClient.invalidateQueries({ queryKey: getGetAdminAgentQueryKey(agentId) });
        } else {
          toast.error(err?.response?.data?.message || err.message || "Failed to update terms");
        }
      }
    });
  };

  // Sync form when fresh data arrives due to conflict refetch
  useEffect(() => {
    if (editOpen) {
      setForm({
        mode: (agent.commercialTerms?.mode as any) || "percentage",
        value: String(agent.commercialTerms?.value || "10")
      });
    }
  }, [agent.commercialTerms?.updatedAt, editOpen]);

  const { data: ledgerData, isLoading: ledgerLoading } = useListAdminAgentLedger(agentId,
    { limit: 20 },
    {
      query: {
        queryKey: getListAdminAgentLedgerQueryKey(agentId, { limit: 20 }),
        enabled: !!agentId
      }
    }
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-secondary mb-1 flex items-center gap-2">
            <Percent className="w-5 h-5 text-muted-foreground" />
            Current Commercial Terms
          </h3>
          {agent.commercialTerms ? (
            <p className="text-sm text-muted-foreground">
              Agent earns <strong className="text-secondary">{agent.commercialTerms.mode === 'percentage' ? `${agent.commercialTerms.value}%` : formatPrice(agent.commercialTerms.value)}</strong> per booking.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Using default platform commission rules.</p>
          )}
        </div>
        <Button onClick={handleOpenEdit} variant="outline">Edit Terms</Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commercial Terms</DialogTitle>
            <DialogDescription>
              Set the commission rules for {agent.profile.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-lg border border-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>Note:</strong> Changing terms only affects <em>future</em> bookings. Existing bookings keep the commission rules active at the time they were created.
            </div>
          </div>
          
          <form onSubmit={handleSaveTerms} className="space-y-6 pt-2">
            <div>
              <label className="text-sm font-bold text-secondary mb-2 block">Commission Type</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={cn("border rounded-xl p-4 cursor-pointer flex flex-col gap-1 items-center justify-center transition-all", form.mode === 'percentage' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50')}>
                  <input type="radio" name="mode" value="percentage" className="sr-only" checked={form.mode === 'percentage'} onChange={() => setForm({ ...form, mode: 'percentage' })} />
                  <span className="font-bold text-secondary">Percentage</span>
                  <span className="text-xs text-muted-foreground">% of booking total</span>
                </label>
                <label className={cn("border rounded-xl p-4 cursor-pointer flex flex-col gap-1 items-center justify-center transition-all", form.mode === 'fixed' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50')}>
                  <input type="radio" name="mode" value="fixed" className="sr-only" checked={form.mode === 'fixed'} onChange={() => setForm({ ...form, mode: 'fixed' })} />
                  <span className="font-bold text-secondary">Fixed Rate</span>
                  <span className="text-xs text-muted-foreground">Flat amount</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-secondary mb-1.5 block">
                {form.mode === 'percentage' ? 'Percentage (%)' : 'Fixed Amount'}
              </label>
              <Input type="number" required min="0" step={form.mode === 'percentage' ? "0.1" : "1"} max={form.mode === 'percentage' ? "100" : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="h-12 text-lg" />
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

      <div>
        <h3 className="font-bold text-secondary mb-4 text-lg">Ledger History</h3>
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Booking Ref</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledgerLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : !ledgerData?.items?.length ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    No ledger entries found.
                  </td>
                </tr>
              ) : ledgerData.items.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 text-muted-foreground whitespace-nowrap">
                    {format(parseISO(entry.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className={cn("uppercase", entry.amount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                      {entry.allocationType}
                    </Badge>
                  </td>
                  <td className="p-4 text-secondary font-mono text-sm">
                     {bookingReferenceLabel(entry.bookingRef)}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className="capitalize">{entry.status}</Badge>
                  </td>
                  <td className="p-4 text-right font-medium">
                    <span className={entry.amount > 0 ? 'text-emerald-700' : 'text-red-700'}>
                      {entry.amount > 0 ? '+' : '-'}{formatPrice(Math.abs(entry.amount))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AgentPayoutsTab({ agentId }: { agentId: string }) {
  const { data, isLoading } = useListAdminAgentPayouts(agentId,
    { limit: 20 },
    {
      query: {
        queryKey: getListAdminAgentPayoutsQueryKey(agentId, { limit: 20 }),
        enabled: !!agentId
      }
    }
  );

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <strong className="block mb-1 text-base">Payment Gateway Not Configured</strong>
          Automated payouts via Stripe Connect are currently disabled in this environment. Failed attempts are shown for audit purposes. No transfers can be initiated or marked paid here.
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
              <th className="p-4 font-bold">Date</th>
              <th className="p-4 font-bold">Reference</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
              </tr>
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={4} className="p-12 text-center text-muted-foreground">
                  No payout history found.
                </td>
              </tr>
            ) : data.items.map(payout => (
              <tr key={payout.id} className="hover:bg-muted/10 transition-colors">
                <td className="p-4 text-muted-foreground whitespace-nowrap">
                  {format(parseISO(payout.createdAt), 'MMM d, yyyy HH:mm')}
                </td>
                <td className="p-4 font-mono text-xs">
                  {payout.provider || 'Manual'}
                </td>
                <td className="p-4">
                  <Badge variant="outline" className={cn(
                    payout.status === 'paid' ? "bg-emerald-50 text-emerald-700" :
                    payout.status === 'failed' ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {payout.status}
                  </Badge>
                  {payout.failureCode && (
                    <div className="text-xs text-red-600 mt-1">{payout.failureCode}</div>
                  )}
                </td>
                <td className="p-4 text-right font-bold text-secondary">
                  {formatPrice(payout.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentActivityTab({ agent }: { agent: AdminAgentDetail }) {
  const events = [
    ...agent.lifecycleHistory.map(h => ({ ...h, type: 'lifecycle' as const })),
    ...agent.commercialTermHistory.map(h => ({ ...h, type: 'commercial' as const })),
    ...(agent.propertyReviewHistory || []).map(h => ({ ...h, type: 'propertyReview' as const }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-xl shadow-sm p-6">
        <h3 className="font-bold text-secondary mb-6 text-lg flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          Agent History
        </h3>
        
        <div className="space-y-6">
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
          ) : events.map(event => (
            <div key={`${event.type}-${event.id}`} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                {event.type === 'lifecycle' ? (
                  <Users className="w-4 h-4 text-muted-foreground" />
                ) : event.type === 'propertyReview' ? (
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Percent className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-secondary">
                  {event.type === 'lifecycle' ? (
                    <>Status changed from <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{event.fromStatus}</span> to <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{event.toStatus}</span></>
                  ) : event.type === 'propertyReview' ? (
                    <>Property <span className="font-bold">{(event as PropertyReviewEvent).propertyName}</span> review: <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{(event as PropertyReviewEvent).fromStatus}</span> to <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{(event as PropertyReviewEvent).toStatus}</span></>
                  ) : (
                    <>Commercial terms updated to <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{(event as CommercialTermEvent).toMode} ({(event as CommercialTermEvent).toValue})</span></>
                  )}
                </div>
                {event.reason && (
                  <div className="text-sm text-muted-foreground mt-1 italic border-l-2 border-muted pl-2">
                    "{event.reason}"
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {format(parseISO(event.createdAt), 'MMM d, yyyy HH:mm')} 
                  {event.actorUserId && ` by admin ${event.actorUserId}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
