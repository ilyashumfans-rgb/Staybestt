import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetAdminBusinessReports,
  getGetAdminBusinessReportsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Loader2, Download, AlertCircle, Info, FilterX,
  Building2, UserRound, CalendarCheck, BriefcaseBusiness, BarChart3, Undo2
} from "lucide-react";
import { bookingReferenceLabel } from "@/lib/booking-display";

type Period = "daily" | "weekly" | "monthly" | "yearly";
type BookingStatus = "confirmed" | "completed" | "cancelled";

const TABS = [
  { id: "revenue", label: "Revenue Report", icon: BarChart3 },
  { id: "properties", label: "Property Report", icon: Building2 },
  { id: "customers", label: "Customer Report", icon: UserRound },
  { id: "bookings", label: "Booking Report", icon: CalendarCheck },
  { id: "refunds", label: "Refunds Report", icon: Undo2 },
  { id: "employees", label: "Employees Report", icon: BriefcaseBusiness },
] as const;

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "₹0";
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

const formatNumber = (num: number | null | undefined) => {
  if (num == null) return "0";
  return num.toLocaleString("en-IN");
};
const reportDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const escapeCsvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '""';
  let stringValue = String(value);
  stringValue = stringValue.replace(/"/g, '""');
  if (/^[=+\-@]/.test(stringValue)) {
    stringValue = "'" + stringValue;
  }
  return `"${stringValue}"`;
};

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800 border-green-200",
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    suspended: "bg-orange-100 text-orange-800 border-orange-200",
    blocked: "bg-red-100 text-red-800 border-red-200",
    exited: "bg-gray-100 text-gray-800 border-gray-200",
  };
  const color = colors[status?.toLowerCase()] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${color}`}>
      {status || "Unknown"}
    </span>
  );
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border border-border rounded-xl shadow-sm">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <FilterX className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-bold text-secondary mb-1">No results found</h3>
      <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}

const SummaryCards = ({ items }: { items: {label: string; value: React.ReactNode}[] }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
    {items.map((item, i) => (
      <div key={i} className="bg-white border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{item.label}</div>
        <div className="text-xl font-black text-secondary mt-1">{item.value}</div>
      </div>
    ))}
  </div>
);

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState<string>("revenue");

  // Filters
  const [period, setPeriod] = useState<Period>("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedDates, setAppliedDates] = useState({ from: "", to: "" });
  const [propertyId, setPropertyId] = useState<number | undefined>();
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | undefined>();
  const [customerInput, setCustomerInput] = useState("");
  const [customer, setCustomer] = useState("");
  const [department, setDepartment] = useState("");

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCustomer(customerInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [customerInput]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedDates({
        from: reportDatePattern.test(from) ? from : "",
        to: reportDatePattern.test(to) ? to : "",
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [from, to]);

  const queryParams = {
    period,
    ...(activeTab !== "employees" && appliedDates.from ? { from: appliedDates.from } : {}),
    ...(activeTab !== "employees" && appliedDates.to ? { to: appliedDates.to } : {}),
    ...(activeTab !== "employees" && propertyId ? { propertyId } : {}),
    ...(activeTab !== "employees" && bookingStatus ? { bookingStatus } : {}),
    ...(activeTab === "customers" && customer ? { customer } : {}),
    ...(activeTab === "employees" && department ? { department } : {}),
  };

  const { data, isLoading, isError } = useGetAdminBusinessReports(
    queryParams,
    { query: { queryKey: getGetAdminBusinessReportsQueryKey(queryParams) } }
  );

  const clearFilters = () => {
    setPeriod("daily");
    setFrom("");
    setTo("");
    setAppliedDates({ from: "", to: "" });
    setPropertyId(undefined);
    setBookingStatus(undefined);
    setCustomerInput("");
    setCustomer("");
    setDepartment("");
  };
  const hasActiveFilters =
    activeTab === "employees"
      ? Boolean(department)
      : Boolean(
          from ||
            to ||
            propertyId ||
            bookingStatus ||
            (activeTab === "customers" && customerInput) ||
            (activeTab === "revenue" && period !== "daily"),
        );

  const exportCsv = () => {
    if (!data) return;

    let header = "";
    let body = "";

    switch(activeTab) {
      case "revenue":
        if (!data.revenue?.rows) return;
        header = "Period,Bookings,Cancelled,Rooms Sold,Revenue (INR)";
        body = data.revenue.rows.map(r => `${escapeCsvCell(r.period)},${r.bookings},${r.cancelled},${r.roomsSold},${r.revenue}`).join("\n");
        break;
      case "properties":
        if (!data.properties?.rows) return;
        header = "ID,Name,Location,Category,Status,Room Types,Room Inventory,Bookings,Rooms Sold,Booking Value (INR)";
        body = data.properties.rows.map(r => `${r.id},${escapeCsvCell(r.name)},${escapeCsvCell(r.location)},${escapeCsvCell(r.category)},${escapeCsvCell(r.status)},${r.roomTypes},${r.roomInventory},${r.bookings},${r.roomsSold},${r.bookingValue}`).join("\n");
        break;
      case "customers":
        if (!data.customers?.rows) return;
        header = "ID,Name,Email,Status,Joined At,Bookings,Booking Value (INR),Last Booking";
        body = data.customers.rows.map(r => `${escapeCsvCell(r.id)},${escapeCsvCell(r.name)},${escapeCsvCell(r.email)},${escapeCsvCell(r.status)},${escapeCsvCell(r.joinedAt)},${r.bookings},${r.bookingValue},${escapeCsvCell(r.lastBookingAt || "")}`).join("\n");
        break;
      case "bookings":
        if (!data.bookings?.rows) return;
        header = "ID,Ref,Booked At,Guest Name,Guest Email,Property ID,Property Name,Room Name,Check In,Check Out,Rooms Count,Status,Booking Value (INR)";
        body = data.bookings.rows.map(r => `${r.id},${escapeCsvCell(r.bookingRef)},${escapeCsvCell(r.bookedAt)},${escapeCsvCell(r.guestName)},${escapeCsvCell(r.guestEmail)},${r.propertyId},${escapeCsvCell(r.propertyName)},${escapeCsvCell(r.roomName)},${escapeCsvCell(r.checkIn)},${escapeCsvCell(r.checkOut)},${r.roomsCount},${escapeCsvCell(r.status)},${r.bookingValue}`).join("\n");
        break;
      case "refunds":
        if (!data.refunds?.rows) return;
        header = "ID,Refund Date,Booking ID,Booking Ref,Invoice ID,Payment ID,Property,Guest Name,Guest Email,Status,Refund Amount (INR),Method,Reason,Reference";
        body = data.refunds.rows.map(r => `${r.id},${escapeCsvCell(r.refundDate)},${r.bookingId},${escapeCsvCell(r.bookingRef)},${r.invoiceId},${r.invoicePaymentId},${escapeCsvCell(r.propertyName)},${escapeCsvCell(r.guestName)},${escapeCsvCell(r.guestEmail)},${escapeCsvCell(r.bookingStatus)},${(r.amountMinor / 100).toFixed(2)},${escapeCsvCell(r.method)},${escapeCsvCell(r.reason)},${escapeCsvCell(r.reference || "")}`).join("\n");
        break;
      case "employees":
        if (!data.employees?.rows) return;
        header = "ID,Code,Name,Email,Designation,Department,Joining Date,Exit Date,Status,CTC (INR)";
        body = data.employees.rows.map(r => `${r.id},${escapeCsvCell(r.employeeCode)},${escapeCsvCell(r.name)},${escapeCsvCell(r.email)},${escapeCsvCell(r.designation)},${escapeCsvCell(r.department)},${escapeCsvCell(r.joiningDate || "")},${escapeCsvCell(r.exitDate || "")},${escapeCsvCell(r.status)},${r.ctcAnnual || 0}`).join("\n");
        break;
    }

    if (!body) return;

    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staybest-${activeTab}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRevenue = () => {
    if (!data) return null;
    const { summary, rows } = data.revenue;
    return (
      <div className="animate-in fade-in duration-300">
        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 mb-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900 leading-tight">
            <strong className="font-semibold">Note:</strong> Revenue represents non-cancelled booking value in INR based on booking creation date, not captured payments or net profit.
          </p>
        </div>
        <SummaryCards items={[
          { label: "Total Revenue", value: formatCurrency(summary.bookingValue) },
          { label: "Bookings", value: formatNumber(summary.bookings) },
          { label: "Cancelled", value: formatNumber(summary.cancelled) },
          { label: "Rooms Sold", value: formatNumber(summary.roomsSold) },
        ]} />
        {rows.length === 0 ? (
          <EmptyState message="No revenue data found for these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Period</th>
                    <th className="px-4 py-3 font-semibold text-right">Bookings</th>
                    <th className="px-4 py-3 font-semibold text-right">Cancelled</th>
                    <th className="px-4 py-3 font-semibold text-right">Rooms Sold</th>
                    <th className="px-4 py-3 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-secondary">{r.period}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.bookings)}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-medium">{formatNumber(r.cancelled)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.roomsSold)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProperties = () => {
    if (!data) return null;
    const { summary, rows } = data.properties;
    return (
      <div className="animate-in fade-in duration-300">
        <SummaryCards items={[
          { label: "Total Properties", value: formatNumber(summary.properties) },
          { label: "Active", value: formatNumber(summary.activeProperties) },
          { label: "Total Bookings", value: formatNumber(summary.bookings) },
          { label: "Booking Value", value: formatCurrency(summary.bookingValue) },
        ]} />
        {rows.length === 0 ? (
          <EmptyState message="No properties match these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Room Types</th>
                    <th className="px-4 py-3 font-semibold text-right">Inventory</th>
                    <th className="px-4 py-3 font-semibold text-right">Bookings</th>
                    <th className="px-4 py-3 font-semibold text-right">Rooms Sold</th>
                    <th className="px-4 py-3 font-semibold text-right">Booking Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">#{r.id}</td>
                      <td className="px-4 py-3 font-medium text-secondary">{r.name}</td>
                      <td className="px-4 py-3">{r.location}</td>
                      <td className="px-4 py-3 capitalize">{r.category}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.roomTypes)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.roomInventory)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.bookings)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.roomsSold)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(r.bookingValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCustomers = () => {
    if (!data) return null;
    const { summary, rows } = data.customers;
    return (
      <div className="animate-in fade-in duration-300">
        <SummaryCards items={[
          { label: "Total Customers", value: formatNumber(summary.customers) },
          { label: "Active", value: formatNumber(summary.activeCustomers) },
          { label: "Total Bookings", value: formatNumber(summary.bookings) },
          { label: "Booking Value", value: formatCurrency(summary.bookingValue) },
        ]} />
        {rows.length === 0 ? (
          <EmptyState message="No customers match these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID / Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Joined At</th>
                    <th className="px-4 py-3 font-semibold text-right">Bookings</th>
                    <th className="px-4 py-3 font-semibold text-right">Booking Value</th>
                    <th className="px-4 py-3 font-semibold">Last Booking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.id}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">{formatDate(r.joinedAt)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.bookings)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(r.bookingValue)}</td>
                      <td className="px-4 py-3">{formatDate(r.lastBookingAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBookings = () => {
    if (!data) return null;
    const { summary, rows } = data.bookings;
    return (
      <div className="animate-in fade-in duration-300">
        <SummaryCards items={[
          { label: "Total Bookings", value: formatNumber(summary.bookings) },
          { label: "Confirmed", value: formatNumber(summary.confirmed) },
          { label: "Completed", value: formatNumber(summary.completed) },
          { label: "Cancelled", value: formatNumber(summary.cancelled) },
          { label: "Booking Value", value: formatCurrency(summary.bookingValue) },
        ]} />
        {rows.length === 0 ? (
          <EmptyState message="No bookings match these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref / Date</th>
                    <th className="px-4 py-3 font-semibold">Guest</th>
                    <th className="px-4 py-3 font-semibold">Property & Room</th>
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Rooms</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary">{bookingReferenceLabel(r.bookingRef, r.status)}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDate(r.bookedAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.guestName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.guestEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium max-w-[200px] truncate" title={r.propertyName}>{r.propertyName}</div>
                        <div className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={r.roomName}>{r.roomName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">{formatDate(r.checkIn)}</div>
                        <div className="text-[11px] text-muted-foreground">to {formatDate(r.checkOut)}</div>
                      </td>
                      <td className="px-4 py-3">{formatNumber(r.roomsCount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(r.bookingValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRefunds = () => {
    if (!data) return null;
    const { summary, breakdown, rows } = data.refunds;
    return (
      <div className="animate-in fade-in duration-300">
        <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3 mb-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-900 leading-tight">
            <strong className="font-semibold">Note:</strong> Refund dates are based on when the refund was recorded, not when the booking was created.
          </p>
        </div>
        <SummaryCards items={[
          { label: "Refund Transactions", value: formatNumber(summary.refundedTransactions) },
          { label: "Distinct Bookings", value: formatNumber(summary.distinctBookings) },
          { label: "Total Refunded Amount", value: formatCurrency(summary.refundedAmountMinor / 100) },
        ]} />
        
        {breakdown.length > 0 && period !== "daily" && (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b bg-muted/10 font-semibold text-sm">Period Breakdown</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Period</th>
                    <th className="px-4 py-3 font-semibold text-right">Transactions</th>
                    <th className="px-4 py-3 font-semibold text-right">Bookings</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount Refunded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {breakdown.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-secondary">{r.period}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.refundedTransactions)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.distinctBookings)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">-{formatCurrency(r.refundedAmountMinor / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState message="No refunds match these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/10 font-semibold text-sm">Refund Transactions</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Refund Date</th>
                    <th className="px-4 py-3 font-semibold">Booking Ref</th>
                    <th className="px-4 py-3 font-semibold">Guest</th>
                    <th className="px-4 py-3 font-semibold">Property</th>
                    <th className="px-4 py-3 font-semibold">Method / Ref</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary">{formatDate(r.refundDate)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{bookingReferenceLabel(r.bookingRef, r.bookingStatus)}</div>
                        <div className="text-[10px] text-muted-foreground"><StatusBadge status={r.bookingStatus} /></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.guestName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.guestEmail}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={r.propertyName}>
                        {r.propertyName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs uppercase">{r.method}</div>
                        {r.reference && <div className="text-[11px] text-muted-foreground">Ref: {r.reference}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">
                        -{formatCurrency(r.amountMinor / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEmployees = () => {
    if (!data) return null;
    const { summary, rows } = data.employees;
    return (
      <div className="animate-in fade-in duration-300">
        <SummaryCards items={[
          { label: "Total Employees", value: formatNumber(summary.employees) },
          { label: "Active", value: formatNumber(summary.activeEmployees) },
          { label: "Exited", value: formatNumber(summary.exitedEmployees) },
          { label: "Total CTC", value: formatCurrency(summary.annualCtc) },
          { label: "Average CTC", value: formatCurrency(summary.averageCtc) },
        ]} />
        {rows.length === 0 ? (
          <EmptyState message="No employees match these filters." />
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code / Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Annual CTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{r.employeeCode}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.designation}</div>
                        <div className="text-[11px] text-muted-foreground">{r.department}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">Joined: {formatDate(r.joiningDate)}</div>
                        {r.exitDate && <div className="text-[11px] text-muted-foreground">Exited: {formatDate(r.exitDate)}</div>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right font-semibold text-secondary">{formatCurrency(r.ctcAnnual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout title="Business Reports">
      <div className="max-w-[1600px] mx-auto pb-10">

        {/* Filter Bar */}
        <div className="bg-white border border-border p-4 rounded-xl shadow-sm flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">

            {activeTab !== "employees" && (
              <>
                <div className="flex items-center border border-input rounded-md overflow-hidden bg-white shadow-sm focus-within:ring-1 focus-within:ring-ring">
                  {activeTab === "revenue" && (
                    <select
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as Period)}
                      className="bg-muted/20 text-sm py-2 px-3 outline-none border-r border-input font-semibold cursor-pointer min-w-[100px] hover:bg-muted/40 transition-colors"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  )}
                  <div className="flex items-center px-3 border-r border-input gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">From</span>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="bg-transparent text-sm py-1.5 outline-none w-[115px] cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center px-3 gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">To</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="bg-transparent text-sm py-1.5 outline-none w-[115px] cursor-pointer"
                    />
                  </div>
                </div>

                <select
                  value={propertyId || ""}
                  onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : undefined)}
                  className="border border-input rounded-md bg-white text-sm py-2 px-3 outline-none font-medium cursor-pointer min-w-[180px] hover:bg-muted/10 transition-colors focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
                >
                  <option value="">All Properties</option>
                  {data?.filters.properties?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <select
                  value={bookingStatus || ""}
                  onChange={(e) => setBookingStatus(e.target.value as BookingStatus || undefined)}
                  className="border border-input rounded-md bg-white text-sm py-2 px-3 outline-none font-medium cursor-pointer min-w-[150px] hover:bg-muted/10 transition-colors focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </>
            )}

            {activeTab === "employees" && (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="border border-input rounded-md bg-white text-sm py-2 px-3 outline-none font-medium cursor-pointer min-w-[150px] hover:bg-muted/10 transition-colors focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
              >
                <option value="">All Departments</option>
                {data?.filters.departments?.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}

            {activeTab === "customers" && (
              <input
                type="text"
                placeholder="Customer (email or name)"
                value={customerInput}
                onChange={e => setCustomerInput(e.target.value)}
                className="border border-input rounded-md bg-white text-sm py-2 px-3 outline-none min-w-[220px] flex-1 md:flex-none focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
              />
            )}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-2 ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Tabs & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex bg-muted/40 p-1 border border-border rounded-xl overflow-x-auto w-full sm:w-auto shadow-sm">
             {TABS.map(t => {
               const Icon = t.icon;
               const isActive = activeTab === t.id;
               return (
                 <button
                   key={t.id}
                   onClick={() => setActiveTab(t.id)}
                   className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                     isActive
                       ? 'bg-white shadow-sm text-primary border border-border/50'
                       : 'text-muted-foreground hover:text-secondary hover:bg-muted/60 border border-transparent'
                   }`}
                 >
                   <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                   {t.label}
                 </button>
               );
             })}
          </div>

          <Button
            onClick={exportCsv}
            variant="outline"
            className="gap-2 shrink-0 w-full sm:w-auto font-semibold shadow-sm rounded-lg"
            disabled={!data || isLoading}
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>

        {/* Main Content */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="font-medium text-sm">Generating reports...</p>
          </div>
        ) : isError ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-red-500 space-y-3 bg-red-50/50 border border-red-100 rounded-xl shadow-sm">
            <AlertCircle className="w-8 h-8" />
            <p className="font-semibold text-sm">Failed to load reports. Please try adjusting your filters.</p>
          </div>
        ) : (
          <div className="min-h-[400px]">
            {activeTab === "revenue" && renderRevenue()}
            {activeTab === "properties" && renderProperties()}
            {activeTab === "customers" && renderCustomers()}
            {activeTab === "bookings" && renderBookings()}
            {activeTab === "refunds" && renderRefunds()}
            {activeTab === "employees" && renderEmployees()}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}