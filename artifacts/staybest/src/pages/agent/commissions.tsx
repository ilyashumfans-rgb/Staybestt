import { AgentLayout } from "@/components/layout/AgentLayout";
import { 
  useGetAgentStats, 
  getGetAgentStatsQueryKey,
  useListAgentLedger,
  useListAgentPayouts,
  getListAgentPayoutsQueryKey,
  getListAgentLedgerQueryKey,
  useGetMe,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { bookingReferenceLabel } from "@/lib/booking-display";
import { Loader2, Wallet, AlertCircle, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { useUser } from "@clerk/react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AgentCommissions() {
  const { isSignedIn } = useUser();
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  const isAgent = me?.role === 'agent' || me?.role === 'admin';

  const { data: stats, isLoading: statsLoading } = useGetAgentStats({
    query: { enabled: isAgent, queryKey: getGetAgentStatsQueryKey() }
  });

  const { data: ledger, isLoading: ledgerLoading } = useListAgentLedger({
    query: { enabled: isAgent, queryKey: getListAgentLedgerQueryKey() }
  });

  const { data: payouts, isLoading: payoutsLoading } = useListAgentPayouts({
    query: { enabled: isAgent, queryKey: getListAgentPayoutsQueryKey() }
  });

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case 'completed': return 'text-green-700 bg-green-50 border-green-200';
      case 'pending': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'failed': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <AgentLayout title="Commissions & Payouts">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-sm font-bold text-muted-foreground uppercase mb-2">Available Balance</p>
            <h2 className="text-4xl font-bold text-primary mb-1" data-testid="text-agent-available-commission">
              {statsLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : formatPrice(stats?.commissionAvailable || 0)}
            </h2>
            <p className="text-sm text-muted-foreground">Recorded available commission balance</p>
          </div>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="status-agent-payouts-unavailable">
            Payouts are unavailable until an administrator connects a payout provider.
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-sm font-bold text-muted-foreground uppercase mb-2">Total Paid</p>
            <h2 className="text-4xl font-bold text-secondary mb-1" data-testid="text-agent-total-paid">
              {statsLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : formatPrice(stats?.commissionPaid || 0)}
            </h2>
            <p className="text-sm text-muted-foreground">Lifetime earnings</p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="w-5 h-5 opacity-50" /> Historical payout total
          </div>
        </div>
      </div>

      <Tabs defaultValue="ledger" className="bg-white rounded-2xl border shadow-sm">
        <div className="border-b px-6 pt-4">
          <TabsList className="bg-transparent h-auto p-0 gap-6">
            <TabsTrigger 
              value="ledger" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-0 pb-3 font-bold"
              data-testid="button-agent-ledger-tab"
            >
              Commission Ledger
            </TabsTrigger>
            <TabsTrigger 
              value="payouts"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-0 pb-3 font-bold"
              data-testid="button-agent-payout-history-tab"
            >
              Payout History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ledger" className="m-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                  <th className="p-4 font-bold">Date</th>
                  <th className="p-4 font-bold">Booking Ref</th>
                  <th className="p-4 font-bold">Type</th>
                  <th className="p-4 font-bold">Terms</th>
                  <th className="p-4 font-bold text-right">Amount</th>
                  <th className="p-4 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                  </tr>
                ) : ledger?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                      <FileText className="w-8 h-8 mb-2 opacity-50 mx-auto" />
                      <p>No commissions earned yet.</p>
                    </td>
                  </tr>
                ) : ledger?.map(entry => (
                  <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 text-sm text-secondary font-medium">
                      {format(new Date(entry.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="p-4 text-sm">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{bookingReferenceLabel(entry.bookingRef)}</span>
                    </td>
                    <td className="p-4 text-sm capitalize">{entry.allocationType}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {entry.termMode === 'percentage' ? `${entry.termValue}%` : `Flat ${formatPrice(entry.termValue)}`}
                    </td>
                    <td className="p-4 text-right font-bold text-green-600">
                      +{formatPrice(entry.amount)}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border capitalize ${getStatusColor(entry.status)}`} data-testid={`status-agent-ledger-${entry.id}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="payouts" className="m-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b">
                  <th className="p-4 font-bold">Date</th>
                  <th className="p-4 font-bold">Payout ID</th>
                  <th className="p-4 font-bold text-right">Amount</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payoutsLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                  </tr>
                ) : payouts?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                      <Wallet className="w-8 h-8 mb-2 opacity-50 mx-auto" />
                      <p>No payouts requested yet.</p>
                    </td>
                  </tr>
                ) : payouts?.map(payout => (
                  <tr key={payout.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 text-sm text-secondary font-medium">
                      {format(new Date(payout.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground font-mono">
                      PO-{payout.id.toString().padStart(5, '0')}
                    </td>
                    <td className="p-4 text-right font-bold text-secondary">
                      {formatPrice(payout.amount)}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border capitalize ${getStatusColor(payout.status)}`} data-testid={`status-agent-payout-${payout.id}`}>
                        {payout.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {payout.status === 'failed' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {payout.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {payout.failureCode ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {payout.failureCode}
                        </span>
                      ) : (
                        <span className="capitalize">{payout.provider || 'System'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </AgentLayout>
  );
}
