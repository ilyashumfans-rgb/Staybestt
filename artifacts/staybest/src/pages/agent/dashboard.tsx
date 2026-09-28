import { AgentLayout } from "@/components/layout/AgentLayout";
import { useGetAgentStats, getGetAgentStatsQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Loader2, CalendarCheck, Wallet, CheckCircle, Clock } from "lucide-react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";

export default function AgentDashboard() {
  const { isSignedIn } = useUser();

  const { data: me } = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() }
  });
  
  const isAgent = me?.role === 'agent' || me?.role === 'admin';

  const { data: stats, isLoading } = useGetAgentStats({
    query: { enabled: isAgent, queryKey: getGetAgentStatsQueryKey() }
  });

  if (isAgent && isLoading) {
    return (
      <AgentLayout title="Overview">
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AgentLayout>
    );
  }

  return (
    <AgentLayout title="Agent Overview">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-secondary mb-2">Welcome back, {me?.name || 'Agent'}</h2>
        <p className="text-muted-foreground">Here is a summary of your performance and earnings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-muted-foreground uppercase">Attributed Bookings</p>
          </div>
          <p className="text-3xl font-bold text-secondary" data-testid="text-agent-attributed-bookings">{stats?.attributedBookings || 0}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-muted-foreground uppercase">Confirmed Bookings</p>
          </div>
          <p className="text-3xl font-bold text-secondary" data-testid="text-agent-confirmed-bookings">{stats?.confirmedBookings || 0}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-muted-foreground uppercase">Commission Available</p>
          </div>
          <p className="text-3xl font-bold text-secondary" data-testid="text-agent-dashboard-available-commission">{formatPrice(stats?.commissionAvailable || 0)}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
              <Wallet className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-muted-foreground uppercase">Total Paid</p>
          </div>
          <p className="text-3xl font-bold text-secondary" data-testid="text-agent-dashboard-total-paid">{formatPrice(stats?.commissionPaid || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border flex flex-col">
          <h3 className="text-lg font-bold text-secondary mb-4">Quick Actions</h3>
          <div className="flex-1 flex flex-col gap-3">
            <Link href="/agent/bookings/new" className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors group" data-testid="link-agent-create-booking">
              <div>
                <p className="font-bold text-secondary group-hover:text-primary">Create New Booking</p>
                <p className="text-sm text-muted-foreground">Book a stay for a customer</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10">
                <CalendarCheck className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </div>
            </Link>
            <Link href="/agent/properties" className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors group" data-testid="link-agent-submit-property">
              <div>
                <p className="font-bold text-secondary group-hover:text-primary">Submit a Property</p>
                <p className="text-sm text-muted-foreground">Add new properties for approval</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10">
                <Wallet className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </div>
            </Link>
            <Link href="/agent/commissions" className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors group" data-testid="link-agent-commissions">
              <div>
                <p className="font-bold text-secondary group-hover:text-primary">View Commissions</p>
                <p className="text-sm text-muted-foreground">Review commission and payout history</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10">
                <Wallet className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AgentLayout>
  );
}
