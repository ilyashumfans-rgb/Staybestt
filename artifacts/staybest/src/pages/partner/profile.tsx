import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { toast } from "sonner";
import {
  useGetPartnerProfile,
  getGetPartnerProfileQueryKey,
  useUpdatePartnerProfile,
  useChangePartnerPassword,
} from "@workspace/api-client-react";
import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Building2, Landmark, KeyRound, LogOut } from "lucide-react";

export default function PartnerProfile() {
  const { signOut } = useClerk();
  const { data, isLoading } = useGetPartnerProfile({
    query: { queryKey: getGetPartnerProfileQueryKey() },
  });
  const updateProfile = useUpdatePartnerProfile();
  const changePassword = useChangePartnerPassword();

  const [form, setForm] = useState({
    businessName: "", gstNumber: "", address: "", contactPhone: "",
    bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankName: "",
  });
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      { data: form },
      {
        onSuccess: () => toast.success("Profile saved"),
        onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to save"),
      },
    );
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (pwd.newPassword !== pwd.confirm) { toast.error("Passwords do not match"); return; }
    changePassword.mutate(
      { data: { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword } },
      {
        onSuccess: () => { toast.success("Password changed"); setPwd({ currentPassword: "", newPassword: "", confirm: "" }); },
        onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to change password"),
      },
    );
  };

  const field = (label: string, key: keyof typeof form, placeholder = "") => (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <Input value={form[key]} onChange={set(key)} placeholder={placeholder} />
    </div>
  );

  return (
    <PartnerLayout title="Profile">
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-8 max-w-3xl">
          <form onSubmit={saveProfile} className="space-y-8">
            {/* Business Details */}
            <div className="bg-white border rounded-2xl shadow-sm p-6">
              <h3 className="font-bold text-secondary flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-primary" /> Business Details
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {field("Business name", "businessName", "e.g. Sunrise Hospitality Pvt Ltd")}
                {field("GST number", "gstNumber", "optional")}
                {field("Contact phone", "contactPhone", "+91…")}
                {field("Registered address", "address")}
              </div>
            </div>

            {/* Bank Details */}
            <div className="bg-white border rounded-2xl shadow-sm p-6">
              <h3 className="font-bold text-secondary flex items-center gap-2 mb-1">
                <Landmark className="w-4 h-4 text-primary" /> Bank Details
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Used for settlements of your earnings</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {field("Account holder name", "bankAccountName")}
                {field("Account number", "bankAccountNumber")}
                {field("IFSC code", "bankIfsc")}
                {field("Bank name", "bankName")}
              </div>
            </div>

            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving..." : "Save Details"}
            </Button>
          </form>

          {/* Change Password */}
          <form onSubmit={submitPassword} className="bg-white border rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-secondary flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-primary" /> Change Password
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Only for accounts with a password login. Google sign-in accounts don't have a password.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Current password</label>
                <Input type="password" required value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">New password</label>
                <Input type="password" required value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Confirm new password</label>
                <Input type="password" required value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
              </div>
            </div>
            <Button type="submit" variant="outline" className="mt-4" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Changing..." : "Change Password"}
            </Button>
          </form>

          {/* Logout */}
          <div className="bg-white border rounded-2xl shadow-sm p-6 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-secondary">Log out</h3>
              <p className="text-xs text-muted-foreground">Sign out of your partner account on this device</p>
            </div>
            <Button variant="destructive" className="gap-2" onClick={() => signOut()}>
              <LogOut className="w-4 h-4" /> Logout
            </Button>
          </div>
        </div>
      )}
    </PartnerLayout>
  );
}
