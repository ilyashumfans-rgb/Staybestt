import { useState } from "react";
import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { useListPartnerBookings, getListPartnerBookingsQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";

export default function PartnerBookings() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const { isSignedIn } = useUser();
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  const isPartner = me?.role === 'partner' || me?.role === 'admin';

  const { data: bookings, isLoading } = useListPartnerBookings(
    filterStatus ? { status: filterStatus } : {},
    { query: { enabled: isPartner, queryKey: getListPartnerBookingsQueryKey(filterStatus ? { status: filterStatus } : {}) } }
  );

  const tabs = [
    { label: "All Bookings", value: "" },
    { label: "Pending payment", value: "pending_payment" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Expired", value: "expired" },
    { label: "Completed", value: "completed" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <PartnerLayout title="Bookings">
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <Button 
            key={tab.value}
            variant={filterStatus === tab.value ? "default" : "outline"}
            onClick={() => setFilterStatus(tab.value)}
            className={filterStatus === tab.value ? "rounded-full" : "rounded-full bg-white hover:bg-muted"}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Reference / Dates</th>
                <th className="p-4 font-bold">Guest Info</th>
                <th className="p-4 font-bold">Property / Room</th>
                <th className="p-4 font-bold text-right">Total</th>
                <th className="p-4 font-bold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : bookings?.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 text-sm">
                    <p className="font-bold text-secondary">{bookingReferenceLabel(booking.bookingRef, booking.status)}</p>
                    <p className="text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(booking.checkIn), "MMM d")} - {format(new Date(booking.checkOut), "MMM d, yyyy")}
                    </p>
                  </td>
                  <td className="p-4 text-sm">
                    <p className="font-bold text-secondary">{booking.guestName}</p>
                    <p className="text-muted-foreground text-xs">{booking.guestEmail}</p>
                    {booking.guestPhone && <p className="text-muted-foreground text-xs">{booking.guestPhone}</p>}
                  </td>
                  <td className="p-4 text-sm max-w-[250px]">
                    <p className="font-bold text-secondary truncate" title={booking.propertyName}>{booking.propertyName}</p>
                    <p className="text-muted-foreground text-xs truncate" title={booking.roomName}>{booking.roomsCount}x {booking.roomName}</p>
                    {booking.specialRequests && (
                      <p className="text-xs text-orange-600 mt-1 truncate" title={booking.specialRequests}>Note: {booking.specialRequests}</p>
                    )}
                  </td>
                  <td className="p-4 text-sm font-bold text-secondary text-right">
                    {formatPrice(booking.totalAmount)}
                  </td>
                  <td className="p-4 text-right">
                    <Badge variant="secondary" className={`capitalize ${
                      booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                       booking.status === 'pending_payment' ? 'bg-amber-100 text-amber-800' :
                      booking.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                       booking.status === 'cancelled' || booking.status === 'expired' ? 'bg-red-100 text-red-800' : ''
                    }`}>
                       {bookingStatusLabel(booking.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(!bookings || bookings.length === 0) && !isLoading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PartnerLayout>
  );
}