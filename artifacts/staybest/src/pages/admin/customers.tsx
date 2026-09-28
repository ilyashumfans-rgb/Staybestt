import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListAdminCustomers,
  useSetCustomerStatus,
  useCreateCustomer,
  useUpdateCustomer,
  useSetCustomerLogin,
  getListAdminCustomersQueryKey,
  type AdminCustomer,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Ban, CheckCircle2, Plus, Pencil } from "lucide-react";
import { format } from "date-fns";

export default function AdminCustomers() {
  const queryClient = useQueryClient();
  const { data: customers, isLoading } = useListAdminCustomers({
    query: { queryKey: getListAdminCustomersQueryKey() },
  });
  const setStatus = useSetCustomerStatus();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const setCustomerLogin = useSetCustomerLogin();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "" });
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", username: "", password: "" });
    setDialogOpen(true);
  };

  const openEdit = (customer: AdminCustomer) => {
    setEditing(customer);
    setForm({ name: customer.name, email: customer.email, username: customer.username ?? "", password: "" });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (createCustomer.isPending || updateCustomer.isPending) return;
    setDialogOpen(false);
    setEditing(null);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const data = { name: form.name.trim(), email: form.email.trim().toLowerCase() };
    if (!data.name || !data.email) {
      toast.error("Enter a customer name and email address");
      return;
    }
    const mutation = editing ? updateCustomer : createCustomer;
    const variables = editing ? { id: editing.id, data } : { data: { ...data, username: form.username.trim().toLowerCase() || undefined, password: form.password || undefined } };
    mutation.mutate(variables as never, {
      onSuccess: (res) => {
        toast.success(res.message);
        if (!editing && "username" in res && res.username && res.password) setCredentials({ username: res.username, password: res.password });
        queryClient.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() });
        setDialogOpen(false);
        setEditing(null);
      },
      onError: (err: any) => {
        toast.error(err?.data?.message || err?.message || "Could not save customer");
      },
    });
  };

  const resetLogin = (customer: AdminCustomer) => {
    const username = prompt("Customer username", customer.username ?? "");
    if (username === null) return;
    const password = prompt("New password (8+ characters), or leave blank to generate one");
    if (password === null) return;
    setCustomerLogin.mutate({ id: customer.id, data: { username: username.trim(), password: password || undefined } }, {
      onSuccess: (result) => {
        if (result.username && result.password) setCredentials({ username: result.username, password: result.password });
        queryClient.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() });
        toast.success(result.message);
      },
      onError: (err: any) => toast.error(err?.data?.message || err?.message || "Could not set login"),
    });
  };

  const handleStatus = (id: string, status: "active" | "blocked") => {
    const verb = status === "blocked" ? "Block" : "Activate";
    if (!confirm(`${verb} this customer?${status === "blocked" ? " They will not be able to make new bookings." : ""}`)) return;
    setStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          queryClient.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to update customer");
        },
      },
    );
  };

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || Boolean(c.username?.includes(q));
  });

  return (
    <AdminLayout title="Customers">
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update the customer's profile details."
                  : "Create a customer record that can be used for booking administration."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="customer@example.com"
                  disabled={Boolean(editing && !editing.id.startsWith("invited:"))}
                />
                {editing && !editing.id.startsWith("invited:") && (
                  <p className="text-xs text-muted-foreground">
                    Registered customers manage their sign-in email through their account.
                  </p>
                )}
              </div>
              {!editing && <div className="space-y-2">
                <Label htmlFor="customer-username">Username (optional)</Label>
                <Input id="customer-username" autoComplete="off" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="Choose a username to create a login" />
                <Label htmlFor="customer-password">Password (optional)</Label>
                <Input id="customer-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Leave blank to generate securely" />
              </div>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                {(createCustomer.isPending || updateCustomer.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editing ? "Save changes" : "Add customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={credentials !== null} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Customer login created</DialogTitle><DialogDescription>This password is shown only once. Save and share it securely now; it cannot be retrieved later.</DialogDescription></DialogHeader>
          <p>Username: <strong>{credentials?.username}</strong></p>
          <p>Password: <strong className="break-all">{credentials?.password}</strong></p>
          <DialogFooter><Button onClick={() => setCredentials(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex-1">
          <h4 className="text-blue-800 font-bold mb-1">Customer Management</h4>
          <p className="text-blue-700 text-sm">
            View every customer's booking activity. Blocked customers can still sign in but cannot
            make new bookings.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <div className="relative md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Customer</th>
                <th className="p-4 font-bold">Email</th>
                <th className="p-4 font-bold">Username</th>
                <th className="p-4 font-bold text-center">Bookings</th>
                <th className="p-4 font-bold text-right">Total Spent</th>
                <th className="p-4 font-bold">Last Booking</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {(c.name || c.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-secondary text-sm">{c.name || "Unnamed"}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-secondary">{c.email}</td>
                    <td className="p-4 text-sm text-secondary">{c.username ?? "—"}</td>
                    <td className="p-4 text-sm text-center font-semibold">{c.bookingsCount}</td>
                    <td className="p-4 text-sm text-right font-semibold">
                      ₹{c.totalSpent.toLocaleString("en-IN")}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {c.lastBookingAt ? format(new Date(c.lastBookingAt), "d MMM yyyy") : "—"}
                    </td>
                    <td className="p-4">
                      <Badge
                        variant="outline"
                        className={
                          c.status === "blocked"
                            ? "border-red-200 text-red-700 bg-red-50"
                            : "border-green-200 text-green-700 bg-green-50"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={setCustomerLogin.isPending} onClick={() => resetLogin(c)}>Set / reset login</Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                        {c.status === "blocked" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-green-700 border-green-200 hover:bg-green-50"
                            disabled={setStatus.isPending}
                            onClick={() => handleStatus(c.id, "active")}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            disabled={setStatus.isPending}
                            onClick={() => handleStatus(c.id, "blocked")}
                          >
                            <Ban className="w-3.5 h-3.5" /> Block
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
