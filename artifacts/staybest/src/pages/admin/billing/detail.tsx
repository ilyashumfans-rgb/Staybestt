import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Mail, IndianRupee, History, Receipt, Building2, Undo2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetAdminInvoice, useGetInvoiceEmailStatus, useRecordInvoicePayment, downloadInvoicePdf } from "@workspace/api-client-react";
import { formatMinorINR, formatBpsToPercent, parseINRToMinor } from "@/lib/currency";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminInvoiceQueryKey, getListAdminInvoicesQueryKey, getGetInvoiceEmailStatusQueryKey } from "@workspace/api-client-react";
import { bookingReferenceLabel } from "@/lib/booking-display";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const paymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  paymentDate: z.string().min(1, "Date is required"),
  method: z.enum(["cash", "upi", "bank", "card", "other"]),
  reference: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function AdminBillingDetail({ params }: { params: { id: string } }) {
  const invoiceId = parseInt(params.id, 10);
  const queryClient = useQueryClient();
  const { data: invoice, isLoading, error } = useGetAdminInvoice(invoiceId, {
    query: { enabled: !isNaN(invoiceId), queryKey: getGetAdminInvoiceQueryKey(invoiceId) }
  });
  const { data: emailStatus } = useGetInvoiceEmailStatus(invoiceId, {
    query: { enabled: !isNaN(invoiceId), queryKey: getGetInvoiceEmailStatusQueryKey(invoiceId) }
  });

  const recordPayment = useRecordInvoicePayment();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Use a stable key per dialog open
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      method: "bank",
      reference: "",
    },
  });

  const handleOpenPayment = () => {
    if (!invoice) return;
    // Set max amount to balance due by default, converted to rupees
    paymentForm.reset({
      amount: invoice.dueMinor > 0 ? invoice.dueMinor / 100 : 0,
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      method: "bank",
      reference: "",
    });
    setIdempotencyKey(crypto.randomUUID());
    setPaymentOpen(true);
  };

  const onPaymentSubmit = (data: PaymentFormValues) => {
    const amountMinor = parseINRToMinor(data.amount);
    if (!invoice) return;
    
    if (amountMinor > invoice.dueMinor) {
      paymentForm.setError("amount", { message: "Cannot exceed balance due" });
      return;
    }

    recordPayment.mutate({
      id: invoiceId,
      data: {
        amountMinor,
        paymentDate: data.paymentDate,
        method: data.method,
        reference: data.reference || null,
        idempotencyKey,
      }
    }, {
      onSuccess: () => {
        toast.success("Payment recorded successfully");
        setPaymentOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetAdminInvoiceQueryKey(invoiceId) });
        queryClient.invalidateQueries({ queryKey: getListAdminInvoicesQueryKey() });
      },
      onError: (err) => {
        toast.error(err.message || "Failed to record payment");
      }
    });
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      const blob = await downloadInvoicePdf(invoiceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${invoice?.invoiceNumber || invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF. Make sure Billing Settings are configured.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Invoice Detail">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-white rounded-md w-32" />
          <div className="h-64 bg-white rounded-xl w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !invoice) {
    return (
      <AdminLayout title="Invoice Detail">
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-destructive font-medium">Failed to load invoice</p>
          <Link href="/admin/billing" className="text-primary hover:underline mt-2 inline-block">
            Return to list
          </Link>
        </div>
      </AdminLayout>
    );
  }

  // Generate mailto link
  const subject = `Invoice ${invoice.invoiceNumber} from StayBest`;
  const body = `Hi ${invoice.customerName},\n\nPlease find attached the invoice ${invoice.invoiceNumber}.\n\nThank you for choosing StayBest!\n`;
  const mailtoLink = `mailto:${invoice.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <AdminLayout title={`Invoice ${invoice.invoiceNumber}`}>
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Link href="/admin/billing" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Invoices
          </Link>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPDF} disabled={isDownloading} className="bg-white">
              <Download className="w-4 h-4 mr-2" />
              {isDownloading ? "Generating..." : "Download PDF"}
            </Button>
            
            <Button variant="outline" asChild className="bg-white">
              <a href={mailtoLink} target="_blank" rel="noreferrer">
                <Mail className="w-4 h-4 mr-2" />
                Open Email Draft
              </a>
            </Button>
            
            {invoice.dueMinor > 0 && (
              <Button onClick={handleOpenPayment}>
                <IndianRupee className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
          </div>
        </div>

        {emailStatus?.status === 'unavailable' && (
          <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
            <Mail className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Email delivery is not configured</p>
              <p>Please use "Open Email Draft" to draft an email in your default client, and manually attach the downloaded PDF before sending.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-secondary mb-2">{invoice.invoiceNumber}</h2>
                  <div className="flex gap-2 text-sm text-muted-foreground">
                    <span>Issued: {format(new Date(invoice.issueDate), "MMM d, yyyy")}</span>
                    <span>•</span>
                    <span>Due: {format(new Date(invoice.dueDate), "MMM d, yyyy")}</span>
                  </div>
                </div>
                <Badge 
                  variant={
                    invoice.status === 'paid' ? 'default' :
                    invoice.status === 'overdue' ? 'destructive' :
                    invoice.status === 'partial' ? 'secondary' : 'outline'
                  }
                  className={`text-sm px-3 py-1 ${invoice.status === 'paid' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                >
                  {invoice.status.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Billed To</h3>
                  <div className="font-medium text-secondary">{invoice.customerName}</div>
                  <div className="text-muted-foreground text-sm">{invoice.customerEmail}</div>
                  {invoice.customerPhone && <div className="text-muted-foreground text-sm">{invoice.customerPhone}</div>}
                  {invoice.customerAddress && <div className="text-muted-foreground text-sm mt-1 whitespace-pre-wrap">{invoice.customerAddress}</div>}
                </div>
                
                {invoice.booking && (
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Linked Stay</h3>
                    {invoice.booking.bookingRef ? (
                      <Link href={`/admin/bookings?search=${encodeURIComponent(invoice.booking.bookingRef)}`}>
                        <div className="bg-muted/30 p-3 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
                          <div className="font-medium text-primary mb-1">{bookingReferenceLabel(invoice.booking.bookingRef)}</div>
                          <div className="text-sm text-secondary flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            {invoice.booking.propertyName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(invoice.booking.checkIn), "MMM d")} - {format(new Date(invoice.booking.checkOut), "MMM d")}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div className="bg-muted/30 p-3 rounded-lg border">
                        <div className="font-medium text-muted-foreground mb-1">{bookingReferenceLabel(invoice.booking.bookingRef)}</div>
                        <div className="text-sm text-secondary flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          {invoice.booking.propertyName}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(invoice.booking.checkIn), "MMM d")} - {format(new Date(invoice.booking.checkOut), "MMM d")}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Line Items</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                      <tr>
                        <th className="px-4 py-2 text-left">Description</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Price</th>
                        <th className="px-4 py-2 text-right">Tax</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-b">
                      {invoice.lines.map(line => (
                        <tr key={line.id}>
                          <td className="px-4 py-3">{line.description}</td>
                          <td className="px-4 py-3 text-right">{line.quantity}</td>
                          <td className="px-4 py-3 text-right">{formatMinorINR(line.unitPriceMinor)}</td>
                          <td className="px-4 py-3 text-right">{line.taxRateBps > 0 ? formatBpsToPercent(line.taxRateBps) : '-'}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatMinorINR(line.totalMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end mt-4">
                  <div className="w-64 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatMinorINR(invoice.subtotalMinor)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span>
                      <span>{formatMinorINR(invoice.taxMinor)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base text-secondary pt-2 border-t border-dashed border-border/60">
                      <span>Total</span>
                      <span>{formatMinorINR(invoice.totalMinor)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 shadow-sm shadow-primary/5 border-primary/20">
              <h3 className="text-lg font-serif font-bold text-secondary mb-4 flex items-center gap-2">
                <WalletIcon className="w-5 h-5 text-primary" /> Payment Status
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
                  <span className="text-muted-foreground">Gross Paid</span>
                  <span className="font-bold text-emerald-600">{formatMinorINR(invoice.grossPaidMinor)}</span>
                </div>
                {invoice.refundedMinor > 0 && (
                  <div className="flex justify-between items-center p-3 bg-orange-50/50 border border-orange-100 rounded-lg">
                    <span className="text-orange-800">Refunded</span>
                    <span className="font-bold text-orange-700">-{formatMinorINR(invoice.refundedMinor)}</span>
                  </div>
                )}
                {invoice.refundedMinor > 0 && (
                  <div className="flex justify-between items-center p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                    <span className="text-emerald-800">Net Received</span>
                    <span className="font-bold text-emerald-700">{formatMinorINR(invoice.netPaidMinor)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-3 bg-red-50/50 rounded-lg">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span className="font-bold text-destructive text-lg">{formatMinorINR(invoice.dueMinor)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4" /> Payment History
              </h3>
              
              {invoice.payments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No payments recorded yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {invoice.payments.map(payment => (
                    <div key={payment.id} className="border-b last:border-0 pb-3 last:pb-0 text-sm">
                      <div className="flex justify-between font-medium mb-1">
                        <span className="text-emerald-600">+{formatMinorINR(payment.amountMinor)}</span>
                        <span className="text-muted-foreground">{format(new Date(payment.paymentDate), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-xs">
                        <span className="uppercase">{payment.method}</span>
                        {payment.reference && <span>Ref: {payment.reference}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {invoice.refunds.length > 0 && (
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Undo2 className="w-4 h-4" /> Refund History
                </h3>
                
                <div className="space-y-4">
                  {invoice.refunds.map(refund => (
                    <div key={refund.id} className="border-b last:border-0 pb-3 last:pb-0 text-sm">
                      <div className="flex justify-between font-medium mb-1">
                        <span className="text-orange-600">-{formatMinorINR(refund.amountMinor)}</span>
                        <span className="text-muted-foreground">{format(new Date(refund.refundDate), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-xs mb-1">
                        <span className="uppercase">{refund.method}</span>
                        {refund.reference && <span>Ref: {refund.reference}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {refund.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a manual payment against invoice {invoice.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>

          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4 pt-4">
              <FormField
                control={paymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" max={invoice.dueMinor / 100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Transaction ID, Cheque No, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={recordPayment.isPending}>
                  {recordPayment.isPending ? "Recording..." : "Save Payment"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
}

function WalletIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  )
}