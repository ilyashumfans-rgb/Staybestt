import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useReviewPropertyDocument,
  getListAdminPropertyDocumentsQueryKey,
  PropertyDocument, 
  PropertyDocumentReviewInputStatus
} from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.status === "rejected" && (!data.reason || data.reason.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason is required when rejecting.",
      path: ["reason"],
    });
  }
});

type ReviewDialogProps = {
  document: PropertyDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewDocumentDialog({ document, open, onOpenChange }: ReviewDialogProps) {
  const queryClient = useQueryClient();
  const reviewMutation = useReviewPropertyDocument();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: "approved",
      reason: "",
    }
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (!document) return;
    try {
      await reviewMutation.mutateAsync({
        documentId: document.id,
        data: {
          status: values.status as PropertyDocumentReviewInputStatus,
          reason: values.reason || null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAdminPropertyDocumentsQueryKey() });
      toast.success(`Document marked as ${values.status}`);
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit review.");
    }
  };

  if (!document) return null;

  const isRejecting = form.watch("status") === "rejected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Review Document</DialogTitle>
          <DialogDescription>
            {document.originalName} for PM-{String(document.propertyNumber).padStart(4, '0')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Decision</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      <option value="approved">Approve</option>
                      <option value="rejected">Reject</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isRejecting && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rejection Reason (Required)</FormLabel>
                    <FormControl>
                      <Input placeholder="Explain why this document is rejected..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={reviewMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={reviewMutation.isPending}>
                {reviewMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Decision
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
