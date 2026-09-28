import { useState } from "react";
import { Link } from "wouter";
import { Plus, Settings, Search, FileText } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListAdminInvoices } from "@workspace/api-client-react";
import { formatMinorINR } from "@/lib/currency";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function AdminBilling() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading, error } = useListAdminInvoices(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined
  );

  const filteredInvoices = invoices?.filter(inv => {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(lowerSearch) ||
      inv.customerName.toLowerCase().includes(lowerSearch) ||
      inv.customerEmail.toLowerCase().includes(lowerSearch)
    );
  });

  return (
    <AdminLayout title="Billing & Invoices">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white"
                data-testid="input-search-invoices"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-white" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Link href="/admin/billing/settings">
              <Button variant="outline" className="w-full sm:w-auto bg-white" data-testid="button-billing-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
            <Link href="/admin/billing/new">
              <Button className="w-full sm:w-auto" data-testid="button-new-invoice">
                <Plus className="w-4 h-4 mr-2" />
                New Invoice
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-white rounded-xl border animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-destructive font-medium">Failed to load invoices</p>
          </div>
        ) : filteredInvoices?.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-serif font-bold text-secondary mb-1">No invoices found</h3>
            <p className="text-muted-foreground mb-6">Create a new invoice to get started with billing.</p>
            <Link href="/admin/billing/new">
              <Button data-testid="button-create-first-invoice">
                <Plus className="w-4 h-4 mr-2" /> Create First Invoice
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Issue Date</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInvoices?.map(inv => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/billing/${inv.id}`} className="font-medium text-primary hover:underline" data-testid={`link-invoice-${inv.id}`}>
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary">{inv.customerName}</div>
                        <div className="text-xs text-muted-foreground">{inv.customerEmail}</div>
                      </td>
                      <td className="px-4 py-3">{format(new Date(inv.issueDate), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3">{format(new Date(inv.dueDate), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3">
                        <Badge 
                          variant={
                            inv.status === 'paid' ? 'default' :
                            inv.status === 'overdue' ? 'destructive' :
                            inv.status === 'partial' ? 'secondary' : 'outline'
                          }
                          className={inv.status === 'paid' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMinorINR(inv.totalMinor)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">
                        {inv.dueMinor > 0 ? formatMinorINR(inv.dueMinor) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}