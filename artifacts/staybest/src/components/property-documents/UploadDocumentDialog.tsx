import { useState, useRef } from "react";
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
import { Loader2, UploadCloud, AlertCircle, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminPropertyDocumentProperties, 
  useListEmployeePropertyDocumentProperties,
  useCreateAdminPropertyDocumentUploadIntent,
  useCreateEmployeePropertyDocumentUploadIntent,
  useFinalizeAdminPropertyDocumentUpload,
  useFinalizeEmployeePropertyDocumentUpload,
  getListAdminPropertyDocumentsQueryKey,
  getListEmployeePropertyDocumentsQueryKey,
  getListAdminPropertyDocumentPropertiesQueryKey,
  getListEmployeePropertyDocumentPropertiesQueryKey,
  PropertyDocumentUploadIntentInputContentType,
  uploadAdminPropertyDocumentContent,
  uploadEmployeePropertyDocumentContent
} from "@workspace/api-client-react";

// Use standard standard custom fetch options for raw PUT
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024; // 20 MiB

const schema = z.object({
  propertyId: z.number({ required_error: "Please select a property." }),
});

type UploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "admin" | "employee";
};

export function UploadDocumentDialog({ open, onOpenChange, role }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const intentRef = useRef<{ intentId: string; uploadUrl: string; uploadHeaders: {[key: string]: string}; putSuccessful: boolean } | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      propertyId: undefined,
    }
  });

  // Admin hooks
  const { data: adminProps } = useListAdminPropertyDocumentProperties(
    { search: searchQuery || undefined }, 
    { query: { enabled: role === "admin" && open, queryKey: getListAdminPropertyDocumentPropertiesQueryKey({ search: searchQuery || undefined }) } }
  );
  const createAdminIntent = useCreateAdminPropertyDocumentUploadIntent();
  const finalizeAdmin = useFinalizeAdminPropertyDocumentUpload();

  // Employee hooks
  const { data: empProps } = useListEmployeePropertyDocumentProperties(
    { search: searchQuery || undefined }, 
    { query: { enabled: role === "employee" && open, queryKey: getListEmployeePropertyDocumentPropertiesQueryKey({ search: searchQuery || undefined }) } }
  );
  const createEmpIntent = useCreateEmployeePropertyDocumentUploadIntent();
  const finalizeEmp = useFinalizeEmployeePropertyDocumentUpload();

  const properties = role === "admin" ? adminProps : empProps;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      intentRef.current = null;
    }
  };

  const getContentType = (type: string) => {
    switch(type) {
      case 'application/pdf': return PropertyDocumentUploadIntentInputContentType['application/pdf'];
      case 'image/jpeg': return PropertyDocumentUploadIntentInputContentType['image/jpeg'];
      case 'image/png': return PropertyDocumentUploadIntentInputContentType['image/png'];
      case 'image/webp': return PropertyDocumentUploadIntentInputContentType['image/webp'];
      default: return PropertyDocumentUploadIntentInputContentType['application/pdf'];
    }
  };

  const doUpload = async (values: z.infer<typeof schema>) => {
    if (!file) {
      toast.error("Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      let uploadUrl = intentRef.current?.uploadUrl;
      let intentId = intentRef.current?.intentId;
      let uploadHeaders = intentRef.current?.uploadHeaders;
      let putSuccessful = intentRef.current?.putSuccessful || false;

      if (!intentId || !uploadUrl || !uploadHeaders) {
        const intentPayload = {
          propertyId: values.propertyId,
          originalName: file.name,
          originalBytes: file.size,
          contentType: getContentType(file.type),
        };

        if (role === "admin") {
          const res = await createAdminIntent.mutateAsync({ data: intentPayload });
          intentId = res.intentId;
          uploadUrl = res.uploadUrl;
          uploadHeaders = res.uploadHeaders;
        } else {
          const res = await createEmpIntent.mutateAsync({ data: intentPayload });
          intentId = res.intentId;
          uploadUrl = res.uploadUrl;
          uploadHeaders = res.uploadHeaders;
        }
        intentRef.current = { intentId, uploadUrl, uploadHeaders, putSuccessful: false };
      }

      setUploadProgress(30);

      // Direct PUT - only if not already successful
      if (!putSuccessful) {
        // Exclude Content-Length as the browser sets it automatically and may warn/error if overridden
        const safeHeaders = { ...uploadHeaders };
        Object.keys(safeHeaders).forEach(key => {
          if (key.toLowerCase() === 'content-length' || key.toLowerCase() === 'content-type') {
            delete safeHeaders[key];
          }
        });

        if (role === "admin") {
          await uploadAdminPropertyDocumentContent(intentId, file, { 
            headers: {
              'Content-Type': file.type,
              ...safeHeaders
            }
          });
        } else {
          await uploadEmployeePropertyDocumentContent(intentId, file, { 
            headers: {
              'Content-Type': file.type,
              ...safeHeaders
            }
          });
        }
        
        // Mark as successful so we don't retry the PUT if finalization fails
        if (intentRef.current) {
          intentRef.current.putSuccessful = true;
        }
      }

      setUploadProgress(70);

      if (role === "admin") {
        await finalizeAdmin.mutateAsync({ intentId });
        queryClient.invalidateQueries({ queryKey: getListAdminPropertyDocumentsQueryKey() });
      } else {
        await finalizeEmp.mutateAsync({ intentId });
        queryClient.invalidateQueries({ queryKey: getListEmployeePropertyDocumentsQueryKey() });
      }

      setUploadProgress(100);
      toast.success("Document uploaded successfully. It is pending review.");
      
      // Reset and close
      setFile(null);
      form.reset();
      intentRef.current = null;
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "An error occurred during upload. You can safely retry.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a PDF, JPG, PNG, or WebP up to 20 MiB.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(doUpload)} className="space-y-6">
            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property (Mandatory)</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isUploading}
                    >
                      <option value="" disabled>Select a property...</option>
                      {properties?.map(p => (
                        <option key={p.id} value={p.id}>
                          PM-{String(p.propertyNumber).padStart(4, '0')} {p.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <div 
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
                } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {!file && (
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                )}
                {file ? (
                  <div className="flex flex-col items-center gap-2 pointer-events-auto">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                    <p className="font-medium text-secondary">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 relative z-10"
                      onClick={(e) => { e.preventDefault(); setFile(null); intentRef.current = null; }}
                      disabled={isUploading}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 pointer-events-none">
                    <UploadCloud className="w-10 h-10 text-muted-foreground" />
                    <p className="font-medium text-secondary">Click or drag file to upload</p>
                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP (Max 20MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-muted p-3 rounded-lg flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                <p>Images are canonically re-encoded and optimized on a best-effort basis. File size can occasionally grow (there is no guarantee it will be smaller, and no original fallback).</p>
                <p>Only ordinary PDFs and images are allowed. Encrypted/password-protected and digitally signed PDFs may be rejected as unsupported.</p>
                <p>All uploads are marked as <strong>pending</strong> until approved.</p>
              </div>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-center text-muted-foreground">Uploading... Please wait.</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>Cancel</Button>
              <Button type="submit" disabled={isUploading || !file}>
                {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading</> : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
