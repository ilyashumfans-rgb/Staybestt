import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Save, Building2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGetBillingSettings, useUpdateBillingSettings } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBillingSettingsQueryKey } from "@workspace/api-client-react";

const schema = z.object({
  businessName: z.string().min(1, "Business name is required").max(200),
  address: z.string().min(1, "Address is required").max(1000),
  taxRegistration: z.string().max(100).optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminBillingSettings() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetBillingSettings();
  const updateSettings = useUpdateBillingSettings();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: "",
      address: "",
      taxRegistration: "",
    },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        businessName: settings.businessName,
        address: settings.address,
        taxRegistration: settings.taxRegistration || "",
      });
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (data: FormValues) => {
    updateSettings.mutate({ data }, {
      onSuccess: (updated) => {
        toast.success("Billing settings saved successfully");
        queryClient.setQueryData(getGetBillingSettingsQueryKey(), updated);
        setLocation("/admin/billing");
      },
      onError: (err) => {
        toast.error(err.message || "Failed to save settings");
      }
    });
  };

  return (
    <AdminLayout title="Billing Settings">
      <div className="max-w-2xl mx-auto">
        <Link href="/admin/billing" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Invoices
        </Link>
        
        <div className="bg-white rounded-xl border p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-secondary">Company Details</h2>
              <p className="text-sm text-muted-foreground">This information will appear on generated invoice PDFs.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-muted rounded-md w-full" />
              <div className="h-24 bg-muted rounded-md w-full" />
              <div className="h-10 bg-muted rounded-md w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. StayBest Hospitality Pvt Ltd" {...field} data-testid="input-business-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Address *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Full registered address..." className="min-h-[100px]" {...field} data-testid="input-business-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="taxRegistration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Registration Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. GSTIN: 29ABCDE1234F1Z5" {...field} value={field.value || ""} data-testid="input-tax-registration" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={updateSettings.isPending} data-testid="button-save-settings">
                    {updateSettings.isPending ? "Saving..." : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Settings
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}