import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListPropertyDocumentUploadGrants,
  useGrantPropertyDocumentUpload,
  useRevokePropertyDocumentUpload,
  getListPropertyDocumentUploadGrantsQueryKey,
} from "@workspace/api-client-react";

export function UploadGrants() {
  const queryClient = useQueryClient();
  const { data: grants, isLoading } = useListPropertyDocumentUploadGrants();
  const grantMutation = useGrantPropertyDocumentUpload();
  const revokeMutation = useRevokePropertyDocumentUpload();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggleGrant = async (userId: string, active: boolean) => {
    setLoadingId(userId);
    try {
      if (active) {
        await grantMutation.mutateAsync({ userId });
        toast.success("Upload access granted");
      } else {
        await revokeMutation.mutateAsync({ userId });
        toast.success("Upload access revoked");
      }
      queryClient.invalidateQueries({ queryKey: getListPropertyDocumentUploadGrantsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update grant");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-6 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-secondary">Staff Upload Access</h2>
          <p className="text-sm text-muted-foreground">Manage which employees can upload documents. Staff can only see their own uploads and cannot review pending documents.</p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <th className="p-4 font-bold">Staff Member</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 font-bold text-right">Upload Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
              </tr>
            ) : grants?.map((grant) => (
              <tr key={grant.userId} className="hover:bg-muted/10">
                <td className="p-4">
                  <div className="font-medium text-secondary">{grant.name}</div>
                  <div className="text-xs text-muted-foreground">{grant.email}</div>
                </td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${grant.userStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                    {grant.userStatus}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {loadingId === grant.userId && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    <Switch 
                      checked={grant.active} 
                      onCheckedChange={(c) => toggleGrant(grant.userId, c)}
                      disabled={loadingId === grant.userId || grant.userStatus !== 'active'}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {(!grants || grants.length === 0) && !isLoading && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">No staff members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
