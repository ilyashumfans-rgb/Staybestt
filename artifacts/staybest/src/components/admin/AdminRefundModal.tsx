import React, { useState, useEffect } from "react";
import { 
  useGetAdminBookingRefunds, 
  useCreateAdminBookingRefund, 
  getGetAdminBookingRefundsQueryKey,
  getGetAdminInvoiceQueryKey
} from "@workspace/api-client-react";
import { formatMinorINR, parseINRToMinor } from "@/lib/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const refundSchema = z.object({
  invoicePaymentId: z.coerce.number().min(1, "Please select a payment source"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  refundDate: z.string().min(1, "Date is required"),
  method: z.enum(["cash", "upi", "bank", "card", "other"]),
  reason: z.string().min(1, "Reason is required"),
  reference: z.string().optional(),
  confirmOutsideApp: z.boolean().refine(val => val === true, "You must confirm this"),
});

type RefundFormValues = z.infer<typeof refundSchema>;

export function AdminRefundModal({ 
  bookingId, 
  open, 
  onOpenChange 
}: { 
  bookingId: number | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const { data: summary, isLoading } = useGetAdminBookingRefunds(bookingId!, {
    query: { enabled: !!bookingId && open, queryKey: getGetAdminBookingRefundsQueryKey(bookingId!) }
  });

  const createRefund = useCreateAdminBookingRefund();

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      invoicePaymentId: 0,
      amount: 0,
      refundDate: format(new Date(), "yyyy-MM-dd"),
      method: "bank",
      reason: "",
      reference: "",
      confirmOutsideApp: false,
    },
  });

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      form.reset({
        invoicePaymentId: 0,
        amount: 0,
        refundDate: format(new Date(), "yyyy-MM-dd"),
        method: "bank",
        reason: "",
        reference: "",
        confirmOutsideApp: false,
      });
    }
  }, [open, form]);

  useEffect(() => {
    if (summary?.availablePaymentSources?.length === 1) {
      const source = summary.availablePaymentSources[0];
      form.setValue("invoicePaymentId", source.invoicePaymentId);
      form.setValue("amount", source.remainingMinor / 100);
    }
  }, [summary, form]);

  const today = format(new Date(), "yyyy-MM-dd");
  const selectedPaymentId = form.watch("invoicePaymentId");
  const selectedSource = summary?.availablePaymentSources.find(s => s.invoicePaymentId === selectedPaymentId);
  const minDate = selectedSource ? format(new Date(selectedSource.paymentDate), "yyyy-MM-dd") : undefined;

  const onSubmit = (data: RefundFormValues) => {
    if (!bookingId) return;
    const amountMinor = parseINRToMinor(data.amount);
    
    const source = summary?.availablePaymentSources.find(s => s.invoicePaymentId === data.invoicePaymentId);
    if (source && amountMinor > source.remainingMinor) {
      form.setError("amount", { message: `Cannot exceed remaining amount of ${formatMinorINR(source.remainingMinor)}` });
      return;
    }

    createRefund.mutate({
      id: bookingId,
      data: {
        invoicePaymentId: data.invoicePaymentId,
        amountMinor,
        refundDate: data.refundDate,
        method: data.method,
        reason: data.reason,
        reference: data.reference || null,
        idempotencyKey,
      }
    }, {
      onSuccess: () => {
        toast.success("Refund recorded successfully");
        // Prefix invalidation to refresh bookings, reports, invoices
        queryClient.invalidateQueries({ queryKey: [ "/api/admin/bookings" ] });
        queryClient.invalidateQueries({ queryKey: [ "/api/admin/reports" ] });
        queryClient.invalidateQueries({ queryKey: [ "/api/admin/invoices" ] });
        
        if (summary?.availablePaymentSources[0]?.invoiceId) {
          queryClient.invalidateQueries({ queryKey: getGetAdminInvoiceQueryKey(summary.availablePaymentSources[0].invoiceId) });
        }
        
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to record refund");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Booking Refunds</DialogTitle>
          <DialogDescription>
            Record manual refunds that have been returned to the customer. This does not transfer money.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !summary ? (
          <div className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/10 rounded-xl border">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Gross Paid</p>
                <p className="text-lg font-bold text-secondary">{formatMinorINR(summary.grossPaidMinor)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-1">Refunded</p>
                <p className="text-lg font-bold text-orange-600">{formatMinorINR(summary.refundedMinor)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Net Received</p>
                <p className="text-lg font-bold text-emerald-600">{formatMinorINR(summary.netPaidMinor)}</p>
              </div>
            </div>

            {/* Refund Action / Form */}
            {summary.availablePaymentSources.length === 0 ? (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex gap-3 text-sm text-orange-800">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1">No available payment sources</p>
                  <p>{summary.refundableReason || "To record a refund, you must first record a payment against the linked invoice."}</p>
                </div>
              </div>
            ) : (
              <div className="border rounded-xl p-4 bg-white shadow-sm">
                <h4 className="font-bold text-sm mb-4">Record New Refund</h4>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="invoicePaymentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Source</FormLabel>
                          <Select onValueChange={(val) => field.onChange(parseInt(val, 10))} value={field.value ? String(field.value) : ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select recorded payment..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {summary.availablePaymentSources.map((source) => (
                                <SelectItem key={source.invoicePaymentId} value={String(source.invoicePaymentId)}>
                                  {format(new Date(source.paymentDate), "MMM d")} - {source.method.toUpperCase()} {source.reference ? `(${source.reference})` : ''} - {formatMinorINR(source.remainingMinor)} available
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="refundDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refund Date</FormLabel>
                            <FormControl>
                              <Input type="date" max={today} min={minDate} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refund Method</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="bank">Bank Transfer</SelectItem>
                                <SelectItem value="upi">UPI</SelectItem>
                                <SelectItem value="card">Card</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="reference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reference (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Transaction ID, UTR..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reason</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Why is this being refunded?" className="resize-none" rows={2} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmOutsideApp"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 bg-muted/10 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-medium">
                              I confirm the money has already been returned outside this app.
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={createRefund.isPending} className="w-full">
                      {createRefund.isPending ? "Recording..." : "Record Refund"}
                    </Button>
                  </form>
                </Form>
              </div>
            )}

            {/* History */}
            {summary.refunds.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Undo2 className="w-4 h-4" /> Refund History
                </h4>
                <div className="space-y-3">
                  {summary.refunds.map(refund => (
                    <div key={refund.id} className="bg-muted/20 border p-3 rounded-lg text-sm">
                      <div className="flex justify-between font-bold text-secondary mb-1">
                        <span className="text-orange-600">-{formatMinorINR(refund.amountMinor)}</span>
                        <span className="text-muted-foreground">{format(new Date(refund.refundDate), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-xs mb-2">
                        <span className="uppercase">{refund.method}</span>
                        {refund.reference && <span>Ref: {refund.reference}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground bg-white p-2 rounded border border-dashed">
                        {refund.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
