import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListAdminBookings, useCreateAdminInvoice, getListAdminInvoicesQueryKey } from "@workspace/api-client-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { parseINRToMinor, parsePercentToBps } from "@/lib/currency";
import { format } from "date-fns";
import { bookingReferenceLabel } from "@/lib/booking-display";

const lineSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.coerce.number().min(1, "Must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Must be positive"),
  taxRatePercent: z.coerce.number().min(0, "Must be positive").optional(),
});

const schema = z.object({
  bookingId: z.string().optional(),
  customerName: z.string().min(1, "Required"),
  customerEmail: z.string().email("Invalid email"),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().min(1, "Required"),
  lineItems: z.array(lineSchema).min(1, "At least one line item required"),
});

type FormValues = z.infer<typeof schema>;

export default function AdminBillingNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: bookings } = useListAdminBookings();
  const createInvoice = useCreateAdminInvoice();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bookingId: "none",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerAddress: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // +7 days
      lineItems: [{ description: "", quantity: 1, unitPrice: 0, taxRatePercent: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const handleBookingSelect = (val: string) => {
    form.setValue("bookingId", val);
    if (val === "none") return;
    
    const booking = bookings?.find(b => b.id.toString() === val);
    if (booking) {
      form.setValue("customerName", booking.guestName);
      form.setValue("customerEmail", booking.guestEmail);
      if (booking.guestPhone) form.setValue("customerPhone", booking.guestPhone);
      
      // Auto-add a line item for the booking
      const firstLine = form.getValues("lineItems")[0];
      if (!firstLine.description && firstLine.unitPrice === 0) {
        form.setValue("lineItems.0", {
          description: `Stay at ${booking.propertyName} (${booking.roomName})`,
          quantity: 1,
          unitPrice: booking.totalAmount, // rupees -> will be converted to minor on submit
          taxRatePercent: 0,
        });
      } else {
        append({
          description: `Stay at ${booking.propertyName} (${booking.roomName})`,
          quantity: 1,
          unitPrice: booking.totalAmount,
          taxRatePercent: 0,
        });
      }
    }
  };

  const onSubmit = (data: FormValues) => {
    const payload = {
      bookingId: data.bookingId && data.bookingId !== "none" ? parseInt(data.bookingId, 10) : null,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone || null,
      customerAddress: data.customerAddress || null,
      issueDate: data.issueDate || undefined,
      dueDate: data.dueDate,
      lineItems: data.lineItems.map(line => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: parseINRToMinor(line.unitPrice),
        taxRateBps: line.taxRatePercent ? parsePercentToBps(line.taxRatePercent) : undefined,
      })),
    };

    createInvoice.mutate({ data: payload }, {
      onSuccess: (invoice) => {
        queryClient.invalidateQueries({ queryKey: getListAdminInvoicesQueryKey() });
        toast.success("Invoice created successfully");
        setLocation(`/admin/billing/${invoice.id}`);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to create invoice");
      }
    });
  };

  return (
    <AdminLayout title="New Invoice">
      <div className="max-w-4xl mx-auto pb-20">
        <Link href="/admin/billing" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Invoices
        </Link>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-serif font-bold text-secondary mb-4 pb-2 border-b">Customer Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="bookingId"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Link to Booking (Optional)</FormLabel>
                      <Select onValueChange={handleBookingSelect} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select a booking to pre-fill details" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Standalone Invoice (No Booking)</SelectItem>
                          {bookings?.map(b => (
                            <SelectItem key={b.id} value={b.id.toString()}>
                              {bookingReferenceLabel(b.bookingRef)} - {b.guestName} ({format(new Date(b.checkIn), "MMM d")})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+91..." {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerAddress"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Billing Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Full address" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4 pb-2 border-b">
                <h2 className="text-lg font-serif font-bold text-secondary">Line Items</h2>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => append({ description: "", quantity: 1, unitPrice: 0, taxRatePercent: 0 })}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Line
                </Button>
              </div>

              <div className="space-y-4">
                <div className="hidden md:grid grid-cols-12 gap-4 px-2 text-sm font-medium text-muted-foreground">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2">Quantity</div>
                  <div className="col-span-2">Unit Price (₹)</div>
                  <div className="col-span-2">Tax (%)</div>
                  <div className="col-span-1"></div>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-muted/20 p-4 md:p-2 md:bg-transparent rounded-lg border md:border-none">
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.description`}
                      render={({ field }) => (
                        <FormItem className="col-span-1 md:col-span-5">
                          <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">Description</div>
                          <FormControl>
                            <Input placeholder="Item description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem className="col-span-1 md:col-span-2">
                          <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">Quantity</div>
                          <FormControl>
                            <Input type="number" min="1" step="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem className="col-span-1 md:col-span-2">
                          <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">Unit Price (₹)</div>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.taxRatePercent`}
                      render={({ field }) => (
                        <FormItem className="col-span-1 md:col-span-2">
                          <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">Tax (%)</div>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="col-span-1 md:pt-0 pt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createInvoice.isPending} data-testid="button-submit-invoice">
                {createInvoice.isPending ? "Creating..." : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Invoice
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AdminLayout>
  );
}