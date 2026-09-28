import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  getListEmployeesQueryKey,
  type EmployeeRecord,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, Pencil, Trash2 } from "lucide-react";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  designation: "",
  department: "",
  joiningDate: "",
  exitDate: "",
  ctcAnnual: "",
  insuranceDetails: "",
  notes: "",
};

export default function AdminHr() {
  const queryClient = useQueryClient();
  const { data: employees, isLoading } = useListEmployees({
    query: { queryKey: getListEmployeesQueryKey() },
  });
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (e: EmployeeRecord) => {
    setEditing(e);
    setForm({
      name: e.name,
      email: e.email,
      phone: e.phone ?? "",
      designation: e.designation,
      department: e.department,
      joiningDate: e.joiningDate ?? "",
      exitDate: e.exitDate ?? "",
      ctcAnnual: e.ctcAnnual != null ? String(e.ctcAnnual) : "",
      insuranceDetails: e.insuranceDetails ?? "",
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const data = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      designation: form.designation.trim(),
      department: form.department.trim(),
      joiningDate: form.joiningDate || null,
      exitDate: form.exitDate || null,
      ctcAnnual: form.ctcAnnual ? Number(form.ctcAnnual) : null,
      insuranceDetails: form.insuranceDetails.trim() || null,
      notes: form.notes.trim() || null,
    };
    const opts = {
      onSuccess: () => {
        toast.success(editing ? "Employee updated" : "Employee added");
        setOpen(false);
        refresh();
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err.message || "Failed to save");
      },
    };
    if (editing) {
      updateEmployee.mutate({ id: editing.id, data }, opts);
    } else {
      createEmployee.mutate({ data }, opts);
    }
  };

  const handleDelete = (e: EmployeeRecord) => {
    if (!confirm(`Delete the HR record for ${e.name} (${e.employeeCode})?`)) return;
    deleteEmployee.mutate(
      { id: e.id },
      {
        onSuccess: () => {
          toast.success("Employee record deleted");
          refresh();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err.message || "Failed to delete");
        },
      },
    );
  };

  const saving = createEmployee.isPending || updateEmployee.isPending;

  return (
    <AdminLayout title="HR & Employees">
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex-1">
          <h4 className="text-blue-800 font-bold mb-1">HR Records</h4>
          <p className="text-blue-700 text-sm">
            Keep employment details for internal staff — employee ID, joining/exit dates, CTC and
            insurance. To give someone login access, add them from the{" "}
            <strong>Users</strong> page as well.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <UserPlus className="w-4 h-4" /> Add Employee
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.employeeCode}` : "Add employee record"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Full name *</label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Designation</label>
                <Input placeholder="e.g. Booking Executive" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Department</label>
                <Input placeholder="e.g. Operations" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Joining date</label>
                <Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Exit date</label>
                <Input type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Annual CTC (₹)</label>
                <Input type="number" min="0" value={form.ctcAnnual} onChange={(e) => setForm({ ...form, ctcAnnual: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Insurance details</label>
                <Input placeholder="Policy no. / provider" value={form.insuranceDetails} onChange={(e) => setForm({ ...form, insuranceDetails: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Notes</label>
                <Input placeholder="Anything else" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Add employee"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Employee ID</th>
                <th className="p-4 font-bold">Name</th>
                <th className="p-4 font-bold">Designation</th>
                <th className="p-4 font-bold">Department</th>
                <th className="p-4 font-bold">Joined</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">CTC (₹/yr)</th>
                <th className="p-4 font-bold text-right">Actions</th>
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
                employees?.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 text-sm font-mono font-semibold text-primary">{e.employeeCode}</td>
                    <td className="p-4">
                      <div className="font-bold text-secondary text-sm">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </td>
                    <td className="p-4 text-sm">{e.designation || "—"}</td>
                    <td className="p-4 text-sm">{e.department || "—"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{e.joiningDate || "—"}</td>
                    <td className="p-4">
                      <Badge
                        variant="outline"
                        className={
                          e.exitDate
                            ? "border-gray-200 text-gray-600 bg-gray-50"
                            : "border-green-200 text-green-700 bg-green-50"
                        }
                      >
                        {e.exitDate ? `Exited ${e.exitDate}` : "Employed"}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-right font-semibold">
                      {e.ctcAnnual != null ? e.ctcAnnual.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          disabled={deleteEmployee.isPending}
                          onClick={() => handleDelete(e)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!isLoading && (!employees || employees.length === 0) && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No employee records yet. Click "Add Employee" to create the first one.
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
