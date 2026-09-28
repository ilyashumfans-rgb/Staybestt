import { useUser } from "@clerk/react";
import {
  getGetBookingByIdQueryKey,
  useGetBookingById,
} from "@workspace/api-client-react";
import { AlertCircle, ArrowLeft, Loader2, MapPin } from "lucide-react";
import { useLocation, useParams, useSearch } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { BookingPaymentActions } from "@/components/BookingPaymentActions";
import { useGuestIdentity } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { bookingStatusLabel, getPaymentHoldExpiresAt } from "@/lib/booking-display";

export default function BookingDetails() {
  const params = useParams();
  const bookingId = Number(params.id);
  const search = new URLSearchParams(useSearch());
  const { isSignedIn } = useUser();
  const { email } = useGuestIdentity();
  const [, setLocation] = useLocation();
  const bookingRef = search.get("bookingRef") || undefined;

  const { data: booking, isLoading, error } = useGetBookingById(
    bookingId,
    isSignedIn ? undefined : { email, bookingRef },
    {
      query: {
        enabled: Number.isInteger(bookingId) && bookingId > 0 && (isSignedIn || (!!email && !!bookingRef)),
        queryKey: getGetBookingByIdQueryKey(
          bookingId,
          isSignedIn ? undefined : { email, bookingRef },
        ),
      },
    },
  );

  if (isLoading) {
    return <Layout><div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Layout>;
  }

  if (error || !booking) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <AlertCircle className="w-10 h-10 text-destructive mb-3" />
          <h1 className="text-2xl font-bold mb-2">Booking details unavailable</h1>
          <p className="text-muted-foreground mb-6">Sign in as the booking owner or return to My Bookings.</p>
          <Button onClick={() => setLocation("/my-bookings")}>Back to My Bookings</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 min-h-screen pt-24 pb-20">
        <div className="container mx-auto max-w-4xl px-4">
          <button onClick={() => setLocation("/my-bookings")} className="flex items-center text-sm font-bold text-secondary mb-8 hover:text-primary">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Bookings
          </button>
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <img src={booking.propertyImageUrl} alt={booking.propertyName} className="w-full h-56 object-cover" />
            <div className="p-6 md:p-8 space-y-6">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">
                    {booking.bookingRef ? `Ref: ${booking.bookingRef}` : `${bookingStatusLabel(booking.status)} · no reference yet`}
                  </p>
                  <h1 className="text-3xl font-serif font-bold text-secondary">{booking.propertyName}</h1>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" /> {booking.propertyCity}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xs text-muted-foreground">Reservation status</p>
                   <p className={`font-bold ${booking.status === "confirmed" ? "text-green-700" : booking.status === "pending_payment" ? "text-amber-700" : "text-secondary"}`}>
                     {bookingStatusLabel(booking.status)}
                   </p>
                  <p className="text-lg font-bold text-primary mt-1">{formatPrice(booking.totalAmount)}</p>
                   {booking.status === "pending_payment" && (
                     <p className="text-xs text-amber-700 mt-1">
                       Payment hold expires {getPaymentHoldExpiresAt(booking)
                         ? format(new Date(getPaymentHoldExpiresAt(booking)!), "MMM d, h:mm a")
                         : "soon"}.
                     </p>
                   )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-xl bg-muted/30 p-4">
                <div><p className="text-xs text-muted-foreground">Check-in</p><p className="font-medium">{format(new Date(booking.checkIn), "MMM d, yyyy")}</p></div>
                <div><p className="text-xs text-muted-foreground">Check-out</p><p className="font-medium">{format(new Date(booking.checkOut), "MMM d, yyyy")}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Room & guests</p><p className="font-medium">{booking.roomsCount} × {booking.roomName} · {booking.guests} guests</p></div>
              </div>
              <BookingPaymentActions booking={booking} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}