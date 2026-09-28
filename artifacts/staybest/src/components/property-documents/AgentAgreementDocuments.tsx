import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { customFetch } from "@workspace/api-client-react";

type AgentDocument = {
  id: string;
  agentName: string;
  agentEmail: string;
  agentId: string;
  propertyId: number | null;
  propertyNumber: number | null;
  propertyName: string | null;
  originalName: string;
  status: string;
  createdAt: string;
  reviewReason: string | null;
};

function api<T>(url: string, init?: RequestInit, responseType: "json" | "blob" = "json") {
  // The admin portal uses a scoped bearer supplied by customFetch's
  // setAdminTokenGetter, not a Clerk cookie. Match every other admin Docs call.
  return customFetch<T>(url, { ...init, credentials: "same-origin", responseType });
}

export function AgentAgreementDocuments() {
  const [documents, setDocuments] = useState<AgentDocument[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    api<AgentDocument[]>("/api/admin/agent-agreement-documents")
      .then(rows => { if (live) setDocuments(rows); })
      .catch(error => { if (live) toast.error(error.message); });
    return () => { live = false; };
  }, [reload]);

  const download = async (document: AgentDocument) => {
    try {
      const blob = await api<Blob>(`/api/admin/agent-agreement-documents/${document.id}/download`, undefined, "blob");
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.originalName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const review = async (document: AgentDocument, status: "approved" | "rejected") => {
    const reason = status === "rejected" ? window.prompt("Reason for rejection (required)") : "";
    if (status === "rejected" && !reason?.trim()) return;
    try {
      await api(`/api/admin/agent-agreement-documents/${document.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      setReload(value => value + 1);
      toast.success(`Agent agreement ${status}.`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return <section className="bg-white border rounded-xl p-5 space-y-3">
    <h2 className="text-lg font-bold">Agent signed agreements</h2>
    <p className="text-sm text-muted-foreground">
      Account-level agreements and those explicitly linked to submitted properties are private; review the signed PDF here.
    </p>
    {documents.length === 0 ? <p className="text-sm text-muted-foreground">No agent agreements uploaded yet.</p>
      : documents.map(document => <div key={document.id} className="border-t pt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{document.agentName} ({document.agentEmail})</span>
        <span className="text-muted-foreground">· {document.propertyNumber == null ? "Agent account" :
          `PM-${String(document.propertyNumber).padStart(4, "0")} ${document.propertyName}`}</span>
        <Button type="button" variant="link" onClick={() => download(document)}>{document.originalName}</Button>
        <span className="capitalize">{document.status}</span>
        {document.reviewReason && <span>{document.reviewReason}</span>}
        {document.status === "pending" && <>
          <Button type="button" size="sm" variant="outline" onClick={() => review(document, "approved")}>Approve</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => review(document, "rejected")}>Reject</Button>
        </>}
      </div>)}
  </section>;
}