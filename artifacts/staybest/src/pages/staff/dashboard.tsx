import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, LogOut, ArrowLeft, Loader2, CheckCircle, XCircle, Search, FileText } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListEmployeeBookings, 
  useEmployeeUpdateBookingStatus, 
  getListEmployeeBookingsQueryKey,
  useGetMe,
  getGetMeQueryKey
} from "@workspace/api-client-react";

export default function StaffDashboard() {
  const [location] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  const isEmployee = me?.role === 'employee' || me?.role === 'admin';

  const { data: bookings, isLoading } = useListEmployeeBookings(
    filterStatus ? { status: filterStatus } : {},
    { query: { enabled: isEmployee, queryKey: getListEmployeeBookingsQueryKey(filterStatus ? { status: filterStatus } : {}) } }
  );

  const updateStatus = useEmployeeUpdateBookingStatus();

  if (!isLoaded) return null;

  if (me && !isEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30 text-center px-4">
        <LayoutDashboard className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-secondary mb-2">Staff access required</h2>
        <p className="text-muted-foreground mb-6">You must be an authorized StayBest employee to access the Staff Desk.</p>
        <Button asChild><Link href="/">Return Home</Link></Button>
      </div>
    );
  }

  const handleUpdateStatus = (id: number, status: string) => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast.success(`Booking marked as ${status}`);
        queryClient.invalidateQueries({ queryKey: getListEmployeeBookingsQueryKey(filterStatus ? { status: filterStatus } : {}) });
        queryClient.invalidateQueries({ queryKey: getListEmployeeBookingsQueryKey({}) });
      },
      onError: (err) => toast.error(err.message || "Failed to update status")
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

  const filteredBookings = bookings?.filter(b => 
    !searchQuery || 
    (b.bookingRef ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.guestName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 text-white border-r border-blue-800 hidden md:flex flex-col">
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/">
            <BrandLogo alt="StayBest Staff" className="h-10 w-auto" />
          </Link>
          <span className="ml-2 text-xs font-bold text-blue-300 tracking-widest uppercase">Staff</span>
        </div>
        
        <div className="p-4 flex-1">
          <p className="text-xs font-bold text-blue-300/60 uppercase tracking-wider mb-4 px-3">Operations</p>
          <nav className="space-y-1">
            <Link href="/staff">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-800 text-white cursor-pointer">
                <LayoutDashboard className="w-5 h-5 text-blue-300" />
                Staff Desk
              </div>
            </Link>
            <Link href="/staff/property-documents">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white cursor-pointer transition-colors">
                <FileText className="w-5 h-5 text-blue-400" />
                Property Docs
              </div>
            </Link>
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white w-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-blue-400" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h1 className="text-2xl font-serif font-bold text-secondary">Operations Desk</h1>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Site
          </Link>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex gap-2">
              {tabs.map(tab => (
                <Button 
                  key={tab.value}
                  variant={filterStatus === tab.value ? "default" : "outline"}
                  onClick={() => setFilterStatus(tab.value)}
                  className="rounded-full bg-white hover:bg-muted"
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ref or Guest Name" 
                className="pl-9 bg-white"
              />
            </div>
          </div>

          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Reference / Dates</th>
                    <th className="p-4 font-bold">Guest Info</th>
                    <th className="p-4 font-bold">Property / Room</th>
                    <th className="p-4 font-bold">Total</th>
                    <th className="p-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
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
                        {formatPrice(booking.totalAmount)}
                        <Badge variant="secondary" className={`mt-1 block w-max capitalize ${
                          booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                           booking.status === 'pending_payment' ? 'bg-amber-100 text-amber-800' :
                          booking.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                          booking.status === 'cancelled' || booking.status === 'expired' ? 'bg-red-100 text-red-800' : ''
                        }`}>
                          {bookingStatusLabel(booking.status)}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        {booking.status === 'confirmed' && (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleUpdateStatus(booking.id, 'completed')}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Check-out
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleUpdateStatus(booking.id, 'cancelled')}>
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                            </Button>
                          </div>
                        )}
                        {(booking.status === 'completed' || booking.status === 'cancelled') && (
                          <Button size="sm" variant="outline" className="text-xs text-secondary border-border hover:bg-muted" onClick={() => handleUpdateStatus(booking.id, 'confirmed')}>
                            Reinstate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!filteredBookings || filteredBookings.length === 0) && !isLoading && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">No bookings found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}