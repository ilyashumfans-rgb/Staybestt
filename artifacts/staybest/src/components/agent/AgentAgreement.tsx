import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type AgreementDocument = {
  id: string;
  propertyId: number | null;
  originalName: string;
  status: string;
  reviewReason: string | null;
};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Agreement request failed (${response.status})`);
  }
  return response;
}

export function AgentAgreement({ agentId, properties }: {
  agentId: string;
  properties: Array<{ id: number; name: string }>;
}) {
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<AgreementDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api("/api/agent/agreement-documents").then(response => response.json())
      .then((rows: AgreementDocument[]) => { if (active) setDocuments(rows); })
      .catch(error => { if (active) toast.error(error.message); });
    return () => { active = false; };
  }, [agentId, reload]);

  const download = async (url: string, name: string) => {
    try {
      const blob = await (await api(url)).blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
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
      await api(`/api/agent/agreement-documents${propertyId === null ? "" : `?propertyId=${propertyId}`}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      toast.success("Signed agreement saved privately for admin review.");
      setFile(null);
      setReload(value => value + 1);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const linkProperty = async (id: string, selectedId: number) => {
    try {
      await api(`/api/agent/agreement-documents/${id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedId }),
      });
      setReload(value => value + 1);
      toast.success("Signed agreement linked to your submitted property.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-border p-5 mb-6 space-y-3" data-testid="agent-agreement">
      <h2 className="font-bold text-secondary">Hotel enrollment agreement · Agent Docs</h2>
      <p className="text-sm">Agreement No. <span className="font-mono">{agentId}</span></p>
      <p className="text-sm text-muted-foreground">
        Download the same hotel partner agreement, complete the blank legal and commercial terms, sign it, and upload the signed PDF.
        You can save it to your account before submitting a property, or select one of your own submitted properties.
        The signed copy remains private for admin review.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <label htmlFor="agent-agreement-property" className="text-sm font-medium">Document association</label>
        <select id="agent-agreement-property" className="h-9 border rounded-md px-2 max-w-xs"
          value={propertyId ?? ""} onChange={event => setPropertyId(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Agent account (no property yet)</option>
          {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
        <Button variant="outline" type="button" onClick={() => download(
          `/api/agent/agreement${propertyId === null ? "" : `?propertyId=${propertyId}`}`,
          "agent-hotel-agreement.pdf",
        )}>Download agreement PDF</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="max-w-sm" type="file" accept=".pdf,application/pdf"
          aria-label="Signed agent hotel agreement PDF"
          onChange={event => setFile(event.target.files?.[0] ?? null)} />
        <Button type="button" disabled={!file || busy} onClick={upload}>{busy ? "Uploading..." : "Upload signed PDF"}</Button>
      </div>
      {documents.length > 0 && <div className="space-y-2 border-t pt-3">
        <p className="font-semibold text-sm">Your signed documents</p>
        {documents.map(doc => <div key={doc.id} className="text-sm flex flex-wrap gap-2 items-center">
          <Button type="button" variant="link" className="p-0" onClick={() => download(
            `/api/agent/agreement-documents/${doc.id}/download`, doc.originalName,
          )}>{doc.originalName}</Button>
          <span>{doc.status}{doc.reviewReason ? `: ${doc.reviewReason}` : ""}</span>
          {doc.propertyId !== null
            ? <span className="text-muted-foreground">· {properties.find(property => property.id === doc.propertyId)?.name ?? "Linked property"}</span>
            : properties.length > 0 && <select className="h-8 border rounded px-2" aria-label="Link agreement to property"
                value="" onChange={event => { if (event.target.value) void linkProperty(doc.id, Number(event.target.value)); }}>
                <option value="">Link to submitted property...</option>
                {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>}
        </div>)}
      </div>}
    </section>
  );
}