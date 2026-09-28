import { AdminLayout } from "@/components/layout/AdminLayout";
import { useGetAdminStats, useListAdminBookings } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Activity, Building2, CalendarClock, IndianRupee, RefreshCcw, UserRound } from "lucide-react";
import { format } from "date-fns";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: bookings, isLoading: bookingsLoading } = useListAdminBookings();

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
    <AdminLayout title="Dashboard Overview">
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[1,2,3,4,5,6,7,8,9].map(i => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
        </div>
      ) : stats ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Customers" value={stats.totalCustomers} icon={UserRound} colorClass="bg-blue-100 text-blue-700" />
            <StatCard title="Total Properties" value={stats.totalProperties} icon={Building2} colorClass="bg-purple-100 text-purple-700" />
            <StatCard title="Today's Revenue" value={formatPrice(stats.todayRevenue)} icon={IndianRupee} colorClass="bg-emerald-100 text-emerald-700" />
            <StatCard title="Monthly Revenue" value={formatPrice(stats.monthlyRevenue)} icon={CalendarClock} colorClass="bg-green-100 text-green-700" />
            <StatCard title="Active Properties" value={stats.activeProperties} icon={Building2} colorClass="bg-teal-100 text-teal-700" />
            <StatCard title="Pending Properties" value={stats.pendingProperties} icon={Building2} colorClass="bg-amber-100 text-amber-700" />
            <StatCard title="Refund Requests" value={stats.refundRequests} icon={RefreshCcw} colorClass="bg-red-100 text-red-700" />
            <StatCard title="Refund Status" value={stats.refundStatus} icon={RefreshCcw} colorClass="bg-orange-100 text-orange-700" />
            <StatCard title="Occupancy Statistics" value={`${stats.occupancyRate.toFixed(1)}% (${stats.occupiedRooms}/${stats.totalRooms})`} icon={Activity} colorClass="bg-indigo-100 text-indigo-700" />
          </div>

          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-secondary">Recent Bookings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Reference</th>
                    <th className="p-4 font-bold">Guest</th>
                    <th className="p-4 font-bold">Property</th>
                    <th className="p-4 font-bold">Dates</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings?.slice(0, 10).map(booking => (
                    <tr key={booking.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4 text-sm font-medium text-secondary">{bookingReferenceLabel(booking.bookingRef, booking.status)}</td>
                      <td className="p-4 text-sm">
                        <p className="font-bold text-secondary">{booking.guestName}</p>
                        <p className="text-muted-foreground text-xs">{booking.guestEmail}</p>
                      </td>
                      <td className="p-4 text-sm">
                        <p className="font-bold text-secondary line-clamp-1">{booking.propertyName}</p>
                        <p className="text-muted-foreground text-xs">{booking.roomName}</p>
                      </td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {format(new Date(booking.checkIn), "MMM d")} - {format(new Date(booking.checkOut), "MMM d, yyyy")}
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary" className={`capitalize ${
                          booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                           booking.status === 'pending_payment' ? 'bg-amber-100 text-amber-800' :
                           booking.status === 'cancelled' || booking.status === 'expired' ? 'bg-red-100 text-red-800' : ''
                        }`}>
                           {bookingStatusLabel(booking.status)}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm font-bold text-secondary text-right">
                        {formatPrice(booking.totalAmount)}
                      </td>
                    </tr>
                  ))}
                  {(!bookings || bookings.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">No recent bookings.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}