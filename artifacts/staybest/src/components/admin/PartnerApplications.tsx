import { useState } from "react";
import {
  useListPartnerApplications,
  useDecidePartnerApplication,
  getListPartnerApplicationsQueryKey,
  getListAdminVendorsQueryKey,
  getListVendorCredentialsQueryKey,
  getListAdminUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, UserCheck, RefreshCw, Phone, MapPin } from "lucide-react";

const statusStyle: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export function PartnerApplications() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const { data, isLoading, isError, error, refetch, isFetching } = useListPartnerApplications({
    query: { queryKey: getListPartnerApplicationsQueryKey(), refetchInterval: 30000 },
  });
  const decide = useDecidePartnerApplication();
  const [busyId, setBusyId] = useState<string | null>(null);

  const apps = data ?? [];
  const pending = apps.filter((a) => a.status === "pending");
  const reviewed = apps.filter((a) => a.status !== "pending");
  const rows = tab === "pending" ? pending : reviewed;

  const act = (id: string, name: string, status: "approved" | "rejected") => {
    if (status === "rejected" && !confirm(`Reject the application from ${name}?`)) return;
    setBusyId(id);
    decide.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast.success(status === "approved" ? `${name} approved` : `${name} rejected`);
          qc.invalidateQueries({ queryKey: getListPartnerApplicationsQueryKey() });
          qc.invalidateQueries({ queryKey: getListAdminVendorsQueryKey() });
          qc.invalidateQueries({ queryKey: getListVendorCredentialsQueryKey() });
          qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        },
        onError: (err: any) => toast.error(err?.data?.message || err?.message || "Could not update application"),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden mb-8" data-testid="section-partner-applications">
      <div className="p-4 border-b flex flex-wrap items-center gap-3">
        <UserCheck className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-secondary">Partner Applications</h3>
        {pending.length > 0 && (
          <span className="text-xs font-bold bg-primary text-white rounded-full px-2 py-0.5">{pending.length} pending</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5 text-xs font-semibold">
            {(["pending", "reviewed"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} data-testid={`tab-applications-${t}`}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors ${tab === t ? "bg-white text-secondary shadow-sm" : "text-muted-foreground"}`}>
                {t} ({t === "pending" ? pending.length : reviewed.length})
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh" data-testid="button-refresh-applications">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm">
          <p className="text-destructive mb-3">{(error as any)?.data?.message || "Could not load partner applications."}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-muted-foreground text-sm">
          {tab === "pending" ? "No applications waiting for review." : "No reviewed applications yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Applicant</th>
                <th className="p-4 font-bold">Business</th>
                <th className="p-4 font-bold">Username</th>
                <th className="p-4 font-bold">Applied</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-muted/10" data-testid={`row-application-${a.id}`}>
                  <td className="p-4 text-sm">
                    <p className="font-bold text-secondary">{a.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {a.phone}</p>
                  </td>
                  <td className="p-4 text-sm">
                    <p className="font-semibold">{a.businessName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.city}</p>
                  </td>
                  <td className="p-4 text-sm font-mono">{a.username}</td>
                  <td className="p-4 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`text-xs font-semibold capitalize border rounded-full px-2.5 py-1 ${statusStyle[a.status] ?? "bg-muted"}`}>{a.status}</span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {a.status !== "approved" && (
                        <Button size="sm" className="gap-1 text-xs" disabled={busyId === a.id} onClick={() => act(a.id, a.name, "approved")} data-testid={`button-approve-${a.id}`}>
                          <Check className="w-3.5 h-3.5" /> Approve
                        </Button>
                      )}
                      {a.status !== "rejected" && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs hover:text-destructive" disabled={busyId === a.id} onClick={() => act(a.id, a.name, "rejected")} data-testid={`button-reject-${a.id}`}>
                          <X className="w-3.5 h-3.5" /> Reject
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
