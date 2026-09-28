import { AdminLayout } from "@/components/layout/AdminLayout";
import { 
  useListAdminUsers, 
  useUpdateUserRole,
  useInviteUser,
  useCreateVendorLogin,
  useDeleteAdminUser,
  useListVendorCredentials,
  getListAdminUsersQueryKey,
  getListVendorCredentialsQueryKey 
} from "@workspace/api-client-react";
import type { VendorCredentials } from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey() } });
  const updateRole = useUpdateUserRole();
  const inviteUser = useInviteUser();
  const createVendor = useCreateVendorLogin();
  const deleteUser = useDeleteAdminUser();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: (res) => {
          toast.success(res.message || "User deleted");
          setDeleteTarget(null);
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListVendorCredentialsQueryKey() });
        },
        onError: () => toast.error("Could not delete this user. Please try again."),
      },
    );
  };
  const { data: credentialsList } = useListVendorCredentials({
    query: { queryKey: getListVendorCredentialsQueryKey() },
  });
  const credsByUserId = new Map((credentialsList ?? []).map((c) => [c.userId, c]));
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const displayLogin = (email: string) =>
    email.endsWith("@partner.staybest.com") ? email.split("@")[0] : email;
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({ login: "", name: "" });
  const [partnerCreds, setPartnerCreds] = useState<{ email: string; username?: string; password: string } | null>(null);

  const handleCreatePartner = (e: React.FormEvent) => {
    e.preventDefault();
    const login = partnerForm.login.trim();
    createVendor.mutate(
      {
        data: login.includes("@")
          ? { email: login, name: partnerForm.name.trim() || undefined }
          : { username: login, name: partnerForm.name.trim() || undefined },
      },
      {
        onSuccess: (res: VendorCredentials) => {
          setPartnerCreds({ email: res.email, username: res.username, password: res.password });
          setPartnerForm({ login: "", name: "" });
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListVendorCredentialsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Could not create login");
        },
      },
    );
  };
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "employee" });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUser.mutate(
      { data: { email: inviteForm.email.trim(), name: inviteForm.name.trim() || undefined, role: inviteForm.role as "customer" | "partner" | "employee" | "admin" | "agent" } },
      {
        onSuccess: () => {
          toast.success("User added — their role applies as soon as they sign in with this email");
          setInviteOpen(false);
          setInviteForm({ email: "", name: "", role: "employee" });
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to add user");
        },
      },
    );
  };

  const handleRoleChange = (id: string, newRole: string) => {
    if (confirm(`Change this user's role to ${newRole}?`)) {
      updateRole.mutate({ id, data: { role: newRole as "customer" | "partner" | "employee" | "admin" | "agent" } }, {
        onSuccess: () => {
          toast.success("User role updated successfully");
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        },
        onError: (err) => {
          toast.error(err.message || "Failed to update user role");
        }
      });
    }
  };

  return (
    <AdminLayout title="Manage Users">
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex-1">
          <h4 className="text-blue-800 font-bold mb-1">Role Management</h4>
          <p className="text-blue-700 text-sm">Assign the <strong>partner</strong> role to hotel owners so they can manage properties. For internal staff handling bookings, assign the <strong>employee</strong> role.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => { setPartnerCreds(null); setPartnerOpen(true); }} className="gap-2">
            <UserPlus className="w-4 h-4" /> Create Partner Login
          </Button>
          <Button variant="outline" onClick={() => setInviteOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> Add Employee
          </Button>
        </div>
      </div>

      <Dialog open={partnerOpen} onOpenChange={(o) => { setPartnerOpen(o); if (!o) setPartnerCreds(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{partnerCreds ? "Partner login created" : "Create partner login"}</DialogTitle>
          </DialogHeader>
          {partnerCreds ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                Save these details now — the password is shown only once here (you can also find it later in Admin → Vendors).
              </div>
              <div className="bg-muted/40 border rounded-xl p-4 space-y-2 font-mono text-sm">
                <div><span className="text-muted-foreground">Login page:</span> {`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners`}</div>
                <div><span className="text-muted-foreground">{partnerCreds.username ? "Username:" : "Email:"}</span> <strong>{partnerCreds.username || partnerCreds.email}</strong></div>
                <div><span className="text-muted-foreground">Password:</span> <strong>{partnerCreds.password}</strong></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  navigator.clipboard.writeText(`StayBest Partner Login\nWebsite: ${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners\n${partnerCreds.username ? "Username: " + partnerCreds.username : "Email: " + partnerCreds.email}\nPassword: ${partnerCreds.password}`);
                  toast.success("Copied");
                }}>Copy all</Button>
                <Button onClick={() => { setPartnerOpen(false); setPartnerCreds(null); }}>Done</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreatePartner} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Username or email *</label>
                <Input required placeholder="e.g. tajresort or owner@hotel.com" value={partnerForm.login} onChange={(e) => setPartnerForm({ ...partnerForm, login: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">A simple username (no @) is easiest. The partner signs in with it at /partners.</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input placeholder="Hotel owner's name (optional)" value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">A strong password is generated automatically.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPartnerOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createVendor.isPending}>{createVendor.isPending ? "Creating..." : "Create login"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Email address *</label>
              <Input
                type="email"
                required
                placeholder="employee@staybestt.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                placeholder="Full name (optional)"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Role *</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="employee">Employee</option>
                <option value="partner">Partner</option>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="customer">Customer</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              The person signs up (or signs in) with this email address and automatically gets the role you chose here.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteUser.isPending}>
                {inviteUser.isPending ? "Adding..." : "Add user"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">User</th>
                <th className="p-4 font-bold">Login</th>
                <th className="p-4 font-bold">Password</th>
                <th className="p-4 font-bold">Current Role</th>
                <th className="p-4 font-bold text-right">Assign Role</th>
                <th className="p-4 font-bold text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : users?.map(user => (
                <tr key={user.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                        {user.name.charAt(0) || user.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-secondary text-sm">{user.name || "Unnamed User"}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-secondary font-mono">{displayLogin(user.email)}</td>
                  <td className="p-4 text-sm">
                    {credsByUserId.get(user.id)?.password ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          {visiblePasswords[user.id] ? credsByUserId.get(user.id)!.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setVisiblePasswords((v) => ({ ...v, [user.id]: !v[user.id] }))}
                        >
                          {visiblePasswords[user.id] ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `StayBest Partner Login\nWebsite: ${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners\nUsername: ${displayLogin(user.email)}\nPassword: ${credsByUserId.get(user.id)!.password}`,
                            );
                            toast.success("Login details copied");
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge variant={
                      user.role === 'admin' ? "default" :
                      user.role === 'partner' ? "secondary" :
                      user.role === 'employee' ? "outline" : "outline"
                    } className={`capitalize ${user.role === 'partner' ? 'bg-primary/10 text-primary hover:bg-primary/20' : ''} ${user.role === 'employee' ? 'border-blue-200 text-blue-700 bg-blue-50' : ''}`}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <select 
                      value={user.role} 
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="h-8 border border-input rounded-md px-2 outline-none focus:ring-2 focus:ring-primary text-xs bg-white cursor-pointer"
                      disabled={updateRole.isPending}
                    >
                      <option value="customer">Customer</option>
                      <option value="partner">Partner</option>
                      <option value="agent">Agent</option>
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete user"
                      onClick={() => setDeleteTarget({ id: user.id, label: user.name || displayLogin(user.email) })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(!users || users.length === 0) && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this user?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-secondary">{deleteTarget?.label}</span> will no longer be able to
            sign in, and their login will be removed. If they have bookings or properties, that history is
            kept for your records. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}