import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type SignedDocument = {
  id: string;
  originalName: string;
  status: string;
  createdAt: string;
};

async function api(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return response;
}

export function PartnerAgreement({ propertyId, propertyNumber }: { propertyId: number; propertyNumber?: number | null }) {
  const [documents, setDocuments] = useState<SignedDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    api(`/api/partner/property-documents?propertyId=${propertyId}`)
      .then(response => response.json())
      .then((records: SignedDocument[]) => { if (live) setDocuments(records); })
      .catch(error => { if (live) toast.error(error.message); });
    return () => { live = false; };
  }, [propertyId, reload]);

  const download = async (url: string, name: string) => {
    try {
      const response = await api(url);
      const blob = await response.blob();
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const upload = async () => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size < 1 || file.size > 20 * 1024 * 1024) {
      toast.error("Choose a signed PDF up to 20 MiB.");
      return;
    }
    setBusy(true);
    try {
      const intent = await (await api("/api/partner/property-documents/upload-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          originalName: `signed-hotel-agreement-${propertyNumber}.pdf`,
          originalBytes: file.size,
          contentType: "application/pdf",
        }),
      })).json();
      await api(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      await api(`/api/partner/property-documents/upload-intents/${intent.intentId}/finalize`, { method: "POST" });
      setFile(null);
      setReload(value => value + 1);
      toast.success("Signed agreement submitted to Property Docs for review.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid={`partner-agreement-${propertyId}`}>
      <p className="text-sm font-medium">Agreement No. {propertyNumber == null ? "Pending property reference" : `PM-${String(propertyNumber).padStart(4, "0")}`}</p>
      <p className="text-sm text-muted-foreground">
        Download the hotel partner agreement, complete any blank terms, sign it, then upload the signed PDF here.
        Your signed copy is kept privately in this property's Docs for admin review.
      </p>
      <Button type="button" variant="outline" onClick={() => download(
        `/api/partner/properties/${propertyId}/agreement`,
        `hotel-agreement-${propertyNumber}.pdf`,
      )}>Download agreement PDF</Button>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept="application/pdf,.pdf" aria-label="Signed hotel agreement PDF"
          onChange={event => setFile(event.target.files?.[0] ?? null)} className="max-w-sm" />
        <Button type="button" onClick={upload} disabled={!file || busy}>
          {busy ? "Uploading..." : "Upload signed PDF"}
        </Button>
      </div>
      {documents.length > 0 && <div className="space-y-1">
        <p className="text-sm font-semibold">Signed documents</p>
        {documents.map(document => (
          <div key={document.id} className="flex items-center gap-2 text-sm">
            <Button type="button" variant="link" className="p-0" onClick={() => download(
              `/api/partner/property-documents/${document.id}/download`, document.originalName,
            )}>{document.originalName}</Button>
            <span className="text-muted-foreground">({document.status})</span>
          </div>
        ))}
      </div>}
    </div>
  );
}