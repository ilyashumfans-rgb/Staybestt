import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { useGetPartnerStats, useListPartnerBookings, useGetMe, getGetMeQueryKey, getGetPartnerStatsQueryKey, getListPartnerBookingsQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Building2, CalendarCheck, CheckCircle, Clock, DoorOpen, Star } from "lucide-react";
import { format } from "date-fns";
import { bookingReferenceLabel } from "@/lib/booking-display";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PartnerDashboard() {
  const { isSignedIn } = useUser();
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  const { data: stats, isLoading: statsLoading } = useGetPartnerStats({
    query: { enabled: me?.role === 'partner' || me?.role === 'admin', queryKey: getGetPartnerStatsQueryKey() }
  });
  
  const { data: bookings, isLoading: bookingsLoading } = useListPartnerBookings({}, {
    query: { enabled: me?.role === 'partner' || me?.role === 'admin', queryKey: getListPartnerBookingsQueryKey({}) }
  });

  if (me && me.role !== 'partner' && me.role !== 'admin') {
    return (
      <PartnerLayout title="Access Denied">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-lg mx-auto">
          <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold text-secondary mb-2">Partner access required</h2>
          <p className="text-muted-foreground mb-6">Contact StayBest support to register as a partner and list your property on our platform.</p>
          <Button asChild><Link href="/">Return Home</Link></Button>
        </div>
      </PartnerLayout>
    );
  }

  const StatCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: string | number, icon: any, colorClass: string }) => (
    <div className="bg-white rounded-2xl border border-border p-6 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-secondary">{value}</p>
      </div>
    </div>
  );

  return (
    <PartnerLayout title="Partner Overview">
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
        </div>
      ) : stats ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Today's Check-ins" value={stats.todaysCheckIns} icon={CalendarCheck} colorClass="bg-orange-100 text-orange-700" />
            <StatCard title="Total Revenue" value={formatPrice(stats.totalRevenue)} icon={CheckCircle} colorClass="bg-green-100 text-green-700" />
            <StatCard title="Occupancy Today" value={`${stats.occupancyPct}%`} icon={Building2} colorClass="bg-purple-100 text-purple-700" />
            <StatCard title="Pending Requests" value={stats.pendingProperties} icon={Star} colorClass="bg-amber-100 text-amber-700" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Confirmed Bookings" value={stats.confirmedBookings} icon={CalendarCheck} colorClass="bg-blue-100 text-blue-700" />
            <StatCard title="Total Properties" value={stats.totalProperties} icon={Building2} colorClass="bg-purple-100 text-purple-700" />
            <StatCard title="Upcoming Check-ins" value={stats.upcomingCheckIns} icon={CalendarCheck} colorClass="bg-teal-100 text-teal-700" />
            <StatCard title="Avg Rating" value={`${stats.averageRating.toFixed(1)}/5`} icon={Star} colorClass="bg-yellow-100 text-yellow-700" />
          </div>

          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-secondary">Recent Bookings</h2>
              <Button asChild variant="outline" size="sm"><Link href="/partner/bookings">View All</Link></Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Reference</th>
                    <th className="p-4 font-bold">Guest</th>
                    <th className="p-4 font-bold">Property / Room</th>
                    <th className="p-4 font-bold">Dates</th>
                    <th className="p-4 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings?.slice(0, 5).map(booking => (
                    <tr key={booking.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4 text-sm font-medium text-secondary">{bookingReferenceLabel(booking.bookingRef)}</td>
                      <td className="p-4 text-sm">
                        <p className="font-bold text-secondary">{booking.guestName}</p>
                      </td>
                      <td className="p-4 text-sm max-w-[200px]">
                        <p className="font-bold text-secondary truncate">{booking.propertyName}</p>
                        <p className="text-muted-foreground text-xs truncate">{booking.roomName}</p>
                      </td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {format(new Date(booking.checkIn), "MMM d")} - {format(new Date(booking.checkOut), "MMM d")}
                      </td>
                      <td className="p-4 text-sm font-bold text-secondary text-right">
                        {formatPrice(booking.totalAmount)}
                      </td>
                    </tr>
                  ))}
                  {(!bookings || bookings.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">No bookings yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <p className="text-muted-foreground">Could not load your dashboard. Please refresh, or sign in again from the partner page.</p>
        </div>
      )}
    </PartnerLayout>
  );
}