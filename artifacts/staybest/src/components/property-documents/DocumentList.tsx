import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Download, Search, CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  useListAdminPropertyDocuments,
  useListEmployeePropertyDocuments,
  downloadAdminPropertyDocument,
  downloadEmployeePropertyDocument,
  PropertyDocument,
  ListAdminPropertyDocumentsStatus,
  getListAdminPropertyDocumentsQueryKey,
  getListEmployeePropertyDocumentsQueryKey
} from "@workspace/api-client-react";
import { ReviewDocumentDialog } from "./ReviewDocumentDialog";
import { UploadDocumentDialog } from "./UploadDocumentDialog";

type DocumentListProps = {
  role: "admin" | "employee";
};

export function DocumentList({ role }: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<PropertyDocument | null>(null);
  
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Admin hooks
  const { data: adminDocs, isLoading: adminLoading, isError: adminError } = useListAdminPropertyDocuments(
    { search: searchQuery || undefined, status: (filterStatus as ListAdminPropertyDocumentsStatus) || undefined },
    { 
      query: { 
        enabled: role === "admin",
        queryKey: getListAdminPropertyDocumentsQueryKey({ search: searchQuery || undefined, status: (filterStatus as ListAdminPropertyDocumentsStatus) || undefined })
      } 
    }
  );

  // Employee hooks
  const { data: empDocs, isLoading: empLoading, isError: empError, error: empErrObj } = useListEmployeePropertyDocuments(
    { 
      query: { 
        enabled: role === "employee",
        queryKey: getListEmployeePropertyDocumentsQueryKey()
      } 
    }
  );

  const docs = role === "admin" ? adminDocs : empDocs;
  const isLoading = role === "admin" ? adminLoading : empLoading;
  
  const isEmployeeForbidden = role === "employee" && (empErrObj as any)?.status === 403;

  const handleDownload = async (doc: PropertyDocument) => {
    setDownloadingId(doc.id);
    try {
      let blob: Blob;
      if (role === "admin") {
        blob = await downloadAdminPropertyDocument(doc.id);
      } else {
        blob = await downloadEmployeePropertyDocument(doc.id);
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  const openReview = (doc: PropertyDocument) => {
    setReviewDoc(doc);
    setReviewOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  if (isEmployeeForbidden) {
    return (
      <div className="bg-red-50 border border-red-100 p-8 rounded-xl text-center">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-red-900 mb-1">Access Denied</h3>
        <p className="text-red-700">You do not have permission to view or upload property documents. Please contact your administrator to request access.</p>
      </div>
    );
  }

  // Employee local filtering since API doesn't take params
  let displayDocs = docs;
  if (role === "employee" && docs) {
    displayDocs = docs.filter(d => {
      const matchStatus = filterStatus ? d.status === filterStatus : true;
      const matchSearch = searchQuery 
        ? d.propertyName.toLowerCase().includes(searchQuery.toLowerCase()) || 
          d.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.propertyNumber.toString().includes(searchQuery)
        : true;
      return matchStatus && matchSearch;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2">
          {["", "pending", "approved", "rejected"].map(status => (
            <Button 
              key={status}
              variant={filterStatus === status ? "default" : "outline"}
              onClick={() => setFilterStatus(status)}
              className="rounded-full bg-white hover:bg-muted capitalize"
              size="sm"
            >
              {status || "All"}
            </Button>
          ))}
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search properties or files..." 
              className="pl-9 bg-white"
            />
          </div>
          <Button onClick={() => setUploadOpen(true)} className="shrink-0 bg-primary hover:bg-primary/90">
            Upload Document
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Document</th>
                <th className="p-4 font-bold">Property</th>
                <th className="p-4 font-bold">Uploader</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : displayDocs?.map(doc => {
                const savings = doc.originalBytes > doc.storedBytes 
                  ? ((doc.originalBytes - doc.storedBytes) / doc.originalBytes * 100).toFixed(0)
                  : 0;

                return (
                  <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-secondary truncate max-w-[200px]" title={doc.originalName}>
                        {doc.originalName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{(doc.originalBytes / 1024 / 1024).toFixed(2)} MB</span>
                        {Number(savings) > 0 && (
                          <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            -{savings}%
                          </span>
                        )}
                        <span className="text-muted-foreground/50 text-[10px]">
                          {format(new Date(doc.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-secondary text-sm">PM-{String(doc.propertyNumber).padStart(4, '0')}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]">{doc.propertyName}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-secondary">{doc.uploaderName}</div>
                      <div className="text-xs text-muted-foreground">{doc.uploadedBy}</div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(doc.status)}
                      {doc.status === "rejected" && doc.reviewReason && (
                        <div className="text-xs text-red-600 mt-1 max-w-[150px] truncate" title={doc.reviewReason}>
                          Reason: {doc.reviewReason}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex gap-2 justify-end">
                        {role === "admin" && doc.status === "pending" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50" 
                            onClick={() => openReview(doc)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> Review
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                        >
                          {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!displayDocs || displayDocs.length === 0) && !isLoading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">No documents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} role={role} />
      <ReviewDocumentDialog open={reviewOpen} onOpenChange={setReviewOpen} document={reviewDoc} />
    </div>
  );
}
