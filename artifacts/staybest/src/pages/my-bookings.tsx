import { Layout } from "@/components/layout/Layout";
import { useListBookings, useCancelBooking, getListBookingsQueryKey } from "@workspace/api-client-react";
import { useGuestIdentity } from "@/hooks/use-auth";
import { useUser, useClerk } from "@clerk/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { Calendar, MapPin, Search, XCircle, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "wouter";
import { BookingPaymentActions } from "@/components/BookingPaymentActions";
import { bookingStatusLabel, getPaymentHoldExpiresAt } from "@/lib/booking-display";

export default function MyBookings() {
  const { email, setEmail } = useGuestIdentity();
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [lookupEmail, setLookupEmail] = useState("");
  const queryClient = useQueryClient();
  const ownerEmail = user?.primaryEmailAddress?.emailAddress || email;
  const bookingListParams = isSignedIn ? undefined : (email ? { email } : undefined);

  const { data: bookings, isLoading } = useListBookings(
    bookingListParams,
    { query: { enabled: isSignedIn || !!email, queryKey: getListBookingsQueryKey(bookingListParams) } }
  );

  const cancelBooking = useCancelBooking();

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupEmail) setEmail(lookupEmail);
  };

  const handleCancel = (bookingId: number, bookingRef: string | null | undefined) => {
    if (!bookingRef) {
      toast.error("This booking has no reference yet because payment is still pending.");
      return;
    }
    if (confirm("Are you sure you want to cancel this booking?")) {
      cancelBooking.mutate({ id: bookingId, data: { email: ownerEmail, bookingRef } }, {
        onSuccess: () => {
          toast.success("Booking cancelled successfully");
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(bookingListParams) });
        },
        onError: (err) => {
          toast.error(err.message || "Failed to cancel booking");
        }
      });
    }
  };

  if (!isSignedIn && !email) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-muted/30">
          <div className="bg-white p-8 rounded-3xl shadow-lg border max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-secondary mb-2">Find Your Bookings</h1>
            <p className="text-muted-foreground mb-8">Enter the email address you used to book your stay.</p>
            
            <form onSubmit={handleLookup} className="space-y-4 text-left">
              <div>
                <label className="text-xs font-bold text-secondary mb-1.5 block">Email Address</label>
                <Input 
                  type="email" 
                  required 
                  value={lookupEmail} 
                  onChange={(e) => setLookupEmail(e.target.value)} 
                  placeholder="your@email.com" 
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base">View Bookings</Button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-secondary pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-serif font-bold text-white mb-2">My Bookings</h1>
              <p className="text-white/70">Managing bookings for <span className="font-bold text-white">{ownerEmail}</span></p>
            </div>
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => {
                setEmail("");
                if (isSignedIn) void signOut();
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 min-h-[50vh]">
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : bookings && bookings.length > 0 ? (
          <div className="space-y-6 max-w-4xl mx-auto">
            {bookings.map((booking) => {
              const statusColor = 
                booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                booking.status === 'pending_payment' ? 'bg-amber-100 text-amber-800' :
                booking.status === 'expired' ? 'bg-red-100 text-red-800' :
                booking.status === 'cancelled' ? 'bg-red-100 text-red-800' : 
                'bg-gray-100 text-gray-800';
                
              const StatusIcon = 
                booking.status === 'confirmed' ? CheckCircle : 
                booking.status === 'pending_payment' ? Clock :
                booking.status === 'cancelled' || booking.status === 'expired' ? XCircle : 
                Clock;

              return (
                <div key={booking.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row">
                  <div className="w-full md:w-64 h-48 md:h-auto relative shrink-0">
                    <img src={booking.propertyImageUrl} alt={booking.propertyName} className="w-full h-full object-cover" />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" className={`${statusColor} border-none shadow-sm flex items-center gap-1 px-3 py-1`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span className="font-bold">{bookingStatusLabel(booking.status)}</span>
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-4">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
                          {booking.bookingRef ? `Ref: ${booking.bookingRef}` : `${bookingStatusLabel(booking.status)} · no reference yet`}
                        </p>
                        {booking.status === "pending_payment" && (
                          <p className="text-xs text-amber-700 mb-1">
                            Complete payment before {getPaymentHoldExpiresAt(booking)
                              ? format(new Date(getPaymentHoldExpiresAt(booking)!), "h:mm a")
                              : "the hold expires"}.
                          </p>
                        )}
                        <h3 className="font-serif font-bold text-xl text-secondary mb-1">
                          <Link href={`/property/${booking.propertyId}`} className="hover:text-primary transition-colors">
                            {booking.propertyName}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted-foreground flex items-center">
                          <MapPin className="w-3.5 h-3.5 mr-1" /> {booking.propertyCity}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-xl font-bold text-secondary">{formatPrice(booking.totalAmount)}</p>
                        <p className="text-xs text-muted-foreground">Reservation total</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-dashed mb-4 bg-muted/20 px-4 rounded-xl">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Check-in</p>
                        <p className="font-medium text-sm">{format(new Date(booking.checkIn), "MMM d, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Check-out</p>
                        <p className="font-medium text-sm">{format(new Date(booking.checkOut), "MMM d, yyyy")}</p>
                      </div>
                      <div className="col-span-2 md:col-span-2">
                        <p className="text-xs text-muted-foreground mb-0.5">Room & Guests</p>
                        <p className="font-medium text-sm line-clamp-1">
                          {booking.roomsCount} × {booking.roomName} ({booking.adults} Adult{booking.adults === 1 ? "" : "s"}{booking.children > 0 ? `, ${booking.children} Child${booking.children === 1 ? "" : "ren"}` : ""})
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-muted-foreground">Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}</p>
                        {isSignedIn || booking.bookingRef ? (
                          <Link
                            href={isSignedIn
                              ? `/my-bookings/${booking.id}`
                              : `/my-bookings/${booking.id}?bookingRef=${encodeURIComponent(booking.bookingRef!)}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            View details
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Details available after payment</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {booking.status === 'confirmed' && booking.freeCancellation && booking.bookingRef && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancel(booking.id, booking.bookingRef)}
                            disabled={cancelBooking.isPending}
                          >
                            Cancel Booking
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      <BookingPaymentActions booking={booking} compact />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-serif font-bold text-secondary mb-2">No bookings found</h2>
            <p className="text-muted-foreground mb-6">Looks like you haven't made any bookings yet, or they are associated with a different email.</p>
            <Button asChild size="lg"><Link href="/search">Explore Stays</Link></Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
