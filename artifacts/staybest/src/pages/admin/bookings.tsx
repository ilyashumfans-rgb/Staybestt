import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListAdminBookings, useUpdateBookingStatus, getListAdminBookingsQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AdminRefundModal } from "@/components/admin/AdminRefundModal";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";

export default function AdminBookings() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterRefundStatus, setFilterRefundStatus] = useState<string>("");
  const queryClient = useQueryClient();

  const [refundBookingId, setRefundBookingId] = useState<number | null>(null);

  const queryParams = {
    ...(filterStatus ? { status: filterStatus } : {}),
  };

  const { data: bookings, isLoading } = useListAdminBookings(
    queryParams,
    { query: { queryKey: getListAdminBookingsQueryKey(queryParams) } }
  );

  const filteredBookings = bookings?.filter(b => {
    if (!filterRefundStatus) return true;
    const summary = b.refundSummary;
    if (filterRefundStatus === "refundable") {
      return summary && summary.remainingRefundableMinor > 0;
    }
    const status = summary?.status || "none";
    return status === filterRefundStatus;
  });

  const updateStatus = useUpdateBookingStatus();

  const handleUpdateStatus = (id: number, status: string) => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast.success(`Booking marked as ${status}`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      },
      onError: (err) => {
        toast.error(err.message || "Failed to update status");
      }
    });
  };

  const tabs = [
    { label: "All Bookings", value: "" },
    { label: "Pending payment", value: "pending_payment" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Expired", value: "expired" },
    { label: "Completed", value: "completed" },
    { label: "Cancelled", value: "cancelled" },
  ];

  const refundTabs = [
    { label: "All", value: "" },
    { label: "Not Refunded", value: "none" },
    { label: "Partially Refunded", value: "partial" },
    { label: "Fully Refunded", value: "full" },
    { label: "Refundable", value: "refundable" },
  ];

  return (
    <AdminLayout title="Manage Bookings">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <Button 
              key={tab.value}
              variant={filterStatus === tab.value ? "default" : "outline"}
              onClick={() => setFilterStatus(tab.value)}
              className="rounded-full"
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          {refundTabs.map(tab => (
            <Button 
              key={tab.value}
              size="sm"
              variant={filterRefundStatus === tab.value ? "secondary" : "ghost"}
              onClick={() => setFilterRefundStatus(tab.value)}
              className="rounded-full text-xs"
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Reference / Dates</th>
                <th className="p-4 font-bold">Guest Info</th>
                <th className="p-4 font-bold">Property / Room</th>
                <th className="p-4 font-bold">Total</th>
                <th className="p-4 font-bold">Reservation / Payment</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : filteredBookings?.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 text-sm">
                     <p className="font-bold text-secondary">{bookingReferenceLabel(booking.bookingRef, booking.status)}</p>
                    <p className="text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(booking.checkIn), "MMM d")} - {format(new Date(booking.checkOut), "MMM d")}
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
                  <td className="p-4 text-sm font-bold text-secondary">
                    <div className="mb-1">{formatPrice(booking.totalAmount)}</div>
                    {booking.refundSummary && booking.refundSummary.refundedMinor > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                        Refunded: {formatPrice(booking.refundSummary.refundedMinor / 100)}
                      </Badge>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge variant="secondary" className={`capitalize ${
                        booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                        booking.status === 'pending_payment' ? 'bg-amber-100 text-amber-800' :
                        booking.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                        booking.status === 'cancelled' || booking.status === 'expired' ? 'bg-red-100 text-red-800' : ''
                      }`}>
                         {bookingStatusLabel(booking.status)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${
                        !booking.refundSummary || booking.refundSummary.status === 'none' ? 'text-muted-foreground' :
                        booking.refundSummary.status === 'partial' ? 'border-orange-200 text-orange-700 bg-orange-50' :
                        booking.refundSummary.status === 'full' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : ''
                      }`}>
                        Refund: {booking.refundSummary?.status || 'none'}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${
                        booking.paymentSummary?.status === 'paid' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                        booking.paymentSummary?.status === 'processing' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                        booking.paymentSummary?.status === 'failed' || booking.paymentSummary?.status === 'refund_required' ? 'border-red-200 text-red-700 bg-red-50' :
                        'text-muted-foreground'
                      }`}>
                        Payment: {booking.paymentSummary?.status || 'unpaid'} · {booking.paymentSummary?.provider === 'razorpay' ? 'Razorpay' : booking.paymentSummary?.provider === 'manual' ? 'Manual' : 'Pay at hotel'}
                      </Badge>
                      {booking.paymentSummary && booking.paymentSummary.amountMinor > 0 && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Payment value: {formatPrice(booking.paymentSummary.amountMinor / 100)}
                          {booking.paymentSummary.paidMinor > 0 && ` · paid ${formatPrice(booking.paymentSummary.paidMinor / 100)}`}
                        </span>
                      )}
                      {booking.paymentSummary?.requiresRefund && (
                        <span className="text-[10px] font-bold text-red-700">Refund required — manual review</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end flex-wrap">
                      {booking.status === 'confirmed' && (
                        <>
                          <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleUpdateStatus(booking.id, 'completed')}>Mark Done</Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleUpdateStatus(booking.id, 'cancelled')}>Cancel</Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" className="text-xs h-7 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setRefundBookingId(booking.id)}>Refunds</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filteredBookings || filteredBookings.length === 0) && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminRefundModal 
        bookingId={refundBookingId} 
        open={refundBookingId !== null} 
        onOpenChange={(open) => !open && setRefundBookingId(null)} 
      />
    </AdminLayout>
  );
}