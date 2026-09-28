import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SignedAgreement = {
  id: string;
  originalName: string;
  propertyId: number | null;
  status: string;
};

export async function downloadAdminAgreement(path: string, filename: string) {
  try {
    const blob = await customFetch<Blob>(path, { responseType: "blob", credentials: "same-origin" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Agreement download failed");
  }
}

export function AdminAgreementDownloads({
  ownerId, role, properties, signed,
}: {
  ownerId: string;
  role: "partner" | "agent";
  properties: { id: number; name: string; propertyNumber?: number | null; status?: string }[];
  signed: SignedAgreement[];
}) {
  const generatedPath = role === "partner"
    ? (propertyId: number) => `/api/admin/partners/${encodeURIComponent(ownerId)}/properties/${propertyId}/agreement`
    : (propertyId: number) => `/api/admin/agents/${encodeURIComponent(ownerId)}/agreement?propertyId=${propertyId}`;
  const signedPath = (id: string) => role === "partner"
    ? `/api/admin/property-documents/${id}/download`
    : `/api/admin/agent-agreement-documents/${id}/download`;

  return <div className="space-y-3 text-sm">
    {role === "agent" && <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">Agent account · Agreement No. {ownerId}</span>
      <Button type="button" variant="outline" size="sm"
        data-testid={`download-agent-account-agreement-${ownerId}`}
        onClick={() => downloadAdminAgreement(
          `/api/admin/agents/${encodeURIComponent(ownerId)}/agreement`,
          "agent-hotel-agreement.pdf",
        )}>Download agreement PDF</Button>
      {signed.filter(doc => doc.propertyId === null).map(doc => <Button key={doc.id} type="button" variant="link" size="sm"
        data-testid={`download-signed-agreement-${doc.id}`}
        onClick={() => downloadAdminAgreement(signedPath(doc.id), doc.originalName)}>
        Signed: {doc.originalName} ({doc.status})
      </Button>)}
    </div>}
    {properties.map(property => <div key={property.id} className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{property.name}{property.propertyNumber != null
        ? ` · PM-${String(property.propertyNumber).padStart(4, "0")}` : ""}</span>
      <Button type="button" variant="outline" size="sm"
        data-testid={`download-${role}-property-agreement-${property.id}`}
        disabled={property.status === "rejected"}
        title={property.status === "rejected" ? "Agreement unavailable for rejected property" : undefined}
        onClick={() => downloadAdminAgreement(generatedPath(property.id),
          role === "partner" ? `hotel-agreement-property-${property.id}.pdf` : "agent-hotel-agreement.pdf")}>
        Download agreement PDF
      </Button>
      {signed.filter(doc => doc.propertyId === property.id).map(doc => <Button key={doc.id} type="button" variant="link" size="sm"
        data-testid={`download-signed-agreement-${doc.id}`}
        onClick={() => downloadAdminAgreement(signedPath(doc.id), doc.originalName)}>
        Signed: {doc.originalName} ({doc.status})
      </Button>)}
    </div>)}
    {role === "partner" && properties.length === 0 &&
      <p className="text-muted-foreground">Assign a property to download its agreement.</p>}
  </div>;
}