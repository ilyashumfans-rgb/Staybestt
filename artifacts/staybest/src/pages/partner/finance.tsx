import { useGetPartnerFinance, getGetPartnerFinanceQueryKey } from "@workspace/api-client-react";
import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { bookingReferenceLabel } from "@/lib/booking-display";
import { Loader2, Wallet, ReceiptIndianRupee, Banknote, CalendarClock } from "lucide-react";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function PartnerFinance() {
  const { data, isLoading, isError, refetch } = useGetPartnerFinance({
    query: { queryKey: getGetPartnerFinanceQueryKey() },
  });

  return (
    <PartnerLayout title="Finance">
      {isError ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">
            Could not load your finance data. Please try again, or sign in again from the partner page.
          </p>
          <button
            className="text-primary font-bold hover:underline"
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      ) : isLoading || !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Earnings Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Earnings", value: inr(data.totalEarnings), icon: Wallet, sub: `${data.completedBookings} completed stays` },
              { label: `Platform Commission (${data.commissionPct}%)`, value: inr(data.totalCommission), icon: ReceiptIndianRupee, sub: "As per agreement" },
              { label: "Net Payable to You", value: inr(data.netPayable), icon: Banknote, sub: "After commission" },
              { label: "Upcoming Revenue", value: inr(data.upcomingRevenue), icon: CalendarClock, sub: "Confirmed future stays" },
            ].map((c) => (
              <div key={c.label} className="bg-white border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  <c.icon className="w-4 h-4 text-primary" /> {c.label}
                </div>
                <div className="text-2xl font-black text-secondary mt-2">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Settlement Reports */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-secondary">Settlement Reports (monthly)</h3>
              <p className="text-xs text-muted-foreground">Based on completed stays (check-out date)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Period</th>
                    <th className="p-4 font-bold">Bookings</th>
                    <th className="p-4 font-bold">Gross</th>
                    <th className="p-4 font-bold">Commission</th>
                    <th className="p-4 font-bold">Net Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.settlements.map((s) => (
                    <tr key={s.period}>
                      <td className="p-4 text-sm font-bold text-secondary">{s.period}</td>
                      <td className="p-4 text-sm">{s.bookings}</td>
                      <td className="p-4 text-sm">{inr(s.gross)}</td>
                      <td className="p-4 text-sm text-muted-foreground">− {inr(s.commission)}</td>
                      <td className="p-4 text-sm font-bold text-green-700">{inr(s.net)}</td>
                    </tr>
                  ))}
                  {data.settlements.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No completed stays yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-secondary">Payment History</h3>
              <p className="text-xs text-muted-foreground">Each booking counted towards your earnings</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[720px]">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Booking Ref</th>
                    <th className="p-4 font-bold">Guest</th>
                    <th className="p-4 font-bold">Property</th>
                    <th className="p-4 font-bold">Check-out</th>
                    <th className="p-4 font-bold">Amount</th>
                    <th className="p-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.payments.map((p) => (
                    <tr key={`${p.bookingRef ?? "pending"}-${p.date}-${p.guestName}`}>
                      <td className="p-4 text-sm font-mono">{bookingReferenceLabel(p.bookingRef)}</td>
                      <td className="p-4 text-sm">{p.guestName}</td>
                      <td className="p-4 text-sm">{p.propertyName}</td>
                      <td className="p-4 text-sm">{p.date}</td>
                      <td className="p-4 text-sm font-bold">{inr(p.amount)}</td>
                      <td className="p-4">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.status === "settled" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {p.status === "settled" ? "Settled" : "Upcoming"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.payments.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No payments yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PartnerLayout>
  );
}
