import { AdminLayout } from "@/components/layout/AdminLayout";
import { UploadGrants } from "@/components/property-documents/UploadGrants";
import { DocumentList } from "@/components/property-documents/DocumentList";
import { AgentAgreementDocuments } from "@/components/property-documents/AgentAgreementDocuments";

export default function AdminPropertyDocuments() {
  return (
    <AdminLayout title="Property Documents">
      <div className="max-w-6xl mx-auto space-y-8">
        <UploadGrants />
        <DocumentList role="admin" />
        <AgentAgreementDocuments />
      </div>
    </AdminLayout>
  );
}
