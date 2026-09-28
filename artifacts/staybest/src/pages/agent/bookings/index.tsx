import { AgentLayout } from "@/components/layout/AgentLayout";
import { useListAgentBookings, getListAgentBookingsQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Loader2, Calendar } from "lucide-react";
import { useUser } from "@clerk/react";
import { format } from "date-fns";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";

export default function AgentBookings() {
  const { isSignedIn } = useUser();

  const { data: me } = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() }
  });
  
  const isAgent = me?.role === 'agent' || me?.role === 'admin';

  const { data: bookings, isLoading } = useListAgentBookings({
    query: { enabled: isAgent, queryKey: getListAgentBookingsQueryKey() }
  });

  return (
    <AgentLayout title="Booking History">
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Booking Ref</th>
                <th className="p-4 font-bold">Property & Room</th>
                <th className="p-4 font-bold">Guest</th>
                <th className="p-4 font-bold">Dates</th>
                <th className="p-4 font-bold text-right">Value</th>
                <th className="p-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : bookings?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Calendar className="w-8 h-8 mb-2 opacity-50" />
                      <p>No bookings attributed to you yet.</p>
                    </div>
                  </td>
                </tr>
              ) : bookings?.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <span className="font-mono font-bold text-sm bg-muted px-2 py-1 rounded">
                      {bookingReferenceLabel(booking.bookingRef, booking.status)}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img src={booking.propertyImageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                      <div>
                        <p className="font-bold text-secondary text-sm">{booking.propertyName}</p>
                        <p className="text-xs text-muted-foreground">{booking.roomName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-secondary">{booking.guestName}</p>
                    <p className="text-xs text-muted-foreground">{booking.guestEmail}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-sm text-secondary">
                      {format(new Date(booking.checkIn), "MMM d")} - {format(new Date(booking.checkOut), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">{booking.nights} nights</p>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-bold text-secondary">{formatPrice(booking.totalAmount)}</span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold capitalize ${
                      booking.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      booking.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
                       booking.status === 'pending_payment' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-red-50 text-red-700 border border-red-200'
                    }`} data-testid={`status-agent-booking-${booking.id}`}>
                       {bookingStatusLabel(booking.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AgentLayout>
  );
}
