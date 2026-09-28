import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListAdminVendors,
  useAssignPropertyOwner,
  useCreateVendorLogin,
  useListVendorCredentials,
  useSetVendorPassword,
  getListAdminVendorsQueryKey,
  getListVendorCredentialsQueryKey,
  useListAdminPropertyDocuments,
} from "@workspace/api-client-react";
import { AdminAgreementDownloads } from "@/components/property-documents/AdminAgreementDownloads";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, Store, MapPin, X, KeyRound, Copy, UserPlus, RefreshCw } from "lucide-react";
import { Link } from "wouter";

export default function AdminVendors() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListAdminVendors({
    query: { queryKey: getListAdminVendorsQueryKey() },
  });
  const assignOwner = useAssignPropertyOwner();
  const createVendor = useCreateVendorLogin();
  const { data: credentialsList } = useListVendorCredentials({
    query: { queryKey: getListVendorCredentialsQueryKey() },
  });
  const setPassword = useSetVendorPassword();

  const handleResetPassword = (userId: string, email: string) => {
    const custom = prompt(
      `Set a new password for ${email} (min 8 characters), or leave empty to auto-generate:`,
    );
    if (custom === null) return;
    const pwd = custom.trim();
    if (pwd && pwd.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPassword.mutate(
      { id: userId, data: { password: pwd || null } },
      {
        onSuccess: (res) => {
          toast.success(`Password updated for ${res.email}`);
          queryClient.invalidateQueries({ queryKey: getListVendorCredentialsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to update password");
        },
      },
    );
  };

  const copyCreds = (email: string, password: string) => {
    navigator.clipboard.writeText(
      `StayBest Partner Login\nWebsite: ${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners\nEmail: ${email}\nPassword: ${password}`,
    );
    toast.success("Credentials copied");
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState({ email: "", name: "" });
  const [credentials, setCredentials] = useState<{ email: string; username?: string; password: string; name: string } | null>(null);

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate(
      {
        data: vendorForm.email.includes("@")
          ? { email: vendorForm.email.trim(), name: vendorForm.name.trim() || undefined }
          : { username: vendorForm.email.trim(), name: vendorForm.name.trim() || undefined },
      },
      {
        onSuccess: (res) => {
          setCredentials(res);
          setVendorForm({ email: "", name: "" });
          queryClient.invalidateQueries({ queryKey: getListAdminVendorsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListVendorCredentialsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to create vendor login");
        },
      },
    );
  };

  const copyCredentials = () => {
    if (!credentials) return;
    navigator.clipboard.writeText(
      `StayBest Partner Login\nWebsite: ${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners\n${credentials.username ? "Username: " + credentials.username : "Email: " + credentials.email}\nPassword: ${credentials.password}`,
    );
    toast.success("Credentials copied — share them with the vendor");
  };

  const handleAssign = (propertyId: number, ownerId: string | null) => {
    assignOwner.mutate(
      { id: propertyId, data: { ownerId } },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          queryClient.invalidateQueries({ queryKey: getListAdminVendorsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to update owner");
        },
      },
    );
  };

  const vendors = data?.vendors ?? [];
  const unassigned = data?.unassignedProperties ?? [];
  const { data: partnerDocuments, isError: documentsError } = useListAdminPropertyDocuments();

  return (
    <AdminLayout title="Vendors">
      <div className="mb-6 flex flex-col md:flex-row md:items-start gap-4 justify-between">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex-1">
          <h4 className="text-blue-800 font-bold mb-1">Vendor Logins</h4>
          <p className="text-blue-700 text-sm">
            Create a ready-to-use login for a hotel owner. You'll get an email + password to share
            with them — they sign in at <strong>/partners</strong>. The password is shown only once.
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => { setCredentials(null); setCreateOpen(true); }}>
          <UserPlus className="w-4 h-4" /> Create Vendor Login
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCredentials(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credentials ? "Vendor login created" : "Create vendor login"}</DialogTitle>
          </DialogHeader>
          {credentials ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                Save these credentials now — the password will not be shown again.
              </div>
              <div className="bg-muted/40 border rounded-xl p-4 space-y-2 font-mono text-sm">
                <div><span className="text-muted-foreground">Login page:</span> {`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners`}</div>
                <div><span className="text-muted-foreground">{credentials.username ? "Username:" : "Email:"}</span> <strong>{credentials.username || credentials.email}</strong></div>
                <div><span className="text-muted-foreground">Password:</span> <strong>{credentials.password}</strong></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="gap-2" onClick={copyCredentials}>
                  <Copy className="w-4 h-4" /> Copy all
                </Button>
                <Button onClick={() => { setCreateOpen(false); setCredentials(null); }}>Done</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateVendor} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Username or email *</label>
                <Input required placeholder="e.g. tajresort or owner@hotel.com" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">A simple username (no @) is easiest for tracking — they sign in with it at /partners.</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input placeholder="Hotel owner's name (optional)" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" /> A strong password is generated automatically.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createVendor.isPending}>
                  {createVendor.isPending ? "Creating..." : "Create login"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="p-4 border-b flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-secondary">Vendor Logins</h3>
          <span className="text-xs text-muted-foreground ml-2">Email &amp; password each vendor uses at /partners</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Vendor</th>
                <th className="p-4 font-bold">Email (username)</th>
                <th className="p-4 font-bold">Password</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(credentialsList ?? []).map((c) => (
                <tr key={c.userId} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 text-sm font-bold text-secondary">{c.name || "—"}</td>
                  <td className="p-4 text-sm font-mono">{c.email}</td>
                  <td className="p-4 text-sm font-mono">
                    {c.password ? (
                      <span className="bg-muted/60 rounded px-2 py-1">{c.password}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Own sign-in (Google/email) — use Change Password to set one</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {c.password && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => copyCreds(c.email, c.password!)}>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        disabled={setPassword.isPending || c.userId.startsWith("invited:")}
                        title={c.userId.startsWith("invited:") ? "This vendor hasn't signed in yet" : undefined}
                        onClick={() => handleResetPassword(c.userId, c.email)}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Change Password
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(credentialsList ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No vendor logins yet. Click "Create Vendor Login" above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-blue-800 font-bold mb-1">Vendor Management</h4>
        <p className="text-blue-700 text-sm">
          Vendors are users with the <strong>partner</strong> role. Add one from the{" "}
          <Link href="/admin/users" className="underline font-semibold">Users page</Link> (Add
          Employee → role Partner), then assign properties to them below. Vendors manage their
          assigned properties from the Partner Dashboard.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {vendors.length === 0 && (
            <div className="bg-white border rounded-2xl p-10 text-center text-muted-foreground">
              <Store className="w-8 h-8 mx-auto mb-3 opacity-40" />
              No vendors yet. Assign the <strong>partner</strong> role to a user to create one.
            </div>
          )}

          {vendors.map((vendor) => (
            <div key={vendor.id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {(vendor.name || vendor.email).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-secondary">{vendor.name || "Unnamed Vendor"}</p>
                    <p className="text-xs text-muted-foreground">{vendor.email}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-primary/10 text-primary w-fit">
                  {vendor.properties.length} {vendor.properties.length === 1 ? "property" : "properties"}
                </Badge>
              </div>

              {vendor.properties.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No properties assigned yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {vendor.properties.map((prop) => (
                    <li key={prop.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Building2 className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-secondary truncate">{prop.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {prop.city}
                            <span className="mx-1">•</span>
                            <span className="capitalize">{prop.category}</span>
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive gap-1 shrink-0"
                        disabled={assignOwner.isPending}
                        onClick={() => {
                          if (confirm(`Unassign "${prop.name}" from ${vendor.name || vendor.email}?`)) {
                            handleAssign(prop.id, null);
                          }
                        }}
                      >
                        <X className="w-3.5 h-3.5" /> Unassign
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="p-5 border-t">
                <p className="font-semibold mb-2">Partner agreements</p>
                {documentsError && <p className="text-destructive text-sm">Could not load signed agreements.</p>}
                <AdminAgreementDownloads ownerId={vendor.id} role="partner" properties={vendor.properties}
                  signed={(partnerDocuments ?? []).filter(doc => doc.uploadedBy === vendor.id &&
                    /^signed-hotel-agreement-[0-9]+\.pdf$/i.test(doc.originalName))} />
              </div>
            </div>
          ))}

          {/* Unassigned properties */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-muted/30">
              <p className="font-bold text-secondary">Unassigned Properties</p>
              <p className="text-xs text-muted-foreground mt-1">
                These properties don't belong to any vendor. Pick a vendor to assign one.
              </p>
            </div>
            {unassigned.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                All properties are assigned to a vendor.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {unassigned.map((prop) => (
                  <li key={prop.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-secondary truncate">{prop.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {prop.city}
                          <span className="mx-1">•</span>
                          <span className="capitalize">{prop.category}</span>
                        </p>
                      </div>
                    </div>
                    <select
                      defaultValue=""
                      disabled={assignOwner.isPending || vendors.length === 0}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssign(prop.id, e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="h-9 border border-input rounded-md px-2 outline-none focus:ring-2 focus:ring-primary text-xs bg-white cursor-pointer shrink-0"
                    >
                      <option value="" disabled>
                        {vendors.length === 0 ? "No vendors available" : "Assign to vendor..."}
                      </option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name || v.email}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
