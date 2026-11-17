import { useState } from "react";
import { customFetch, type AgentAgreementDetails } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const labels: Record<keyof AgentAgreementDetails, string> = {
  fullName: "Agent full name", email: "Agent email", fatherName: "Father's name",
  address: "Agent address", mobile: "Mobile number", pan: "PAN number",
  bank: "Bank account holder, number, bank and IFSC",
  commission: "Commission wording (e.g. 10% or INR 500 fixed)",
};

export function AgentAgreementEditor({ agentId }: { agentId: string }) {
  const [details, setDetails] = useState<AgentAgreementDetails | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/admin/agents/${encodeURIComponent(agentId)}/agreement-details`;
  async function load() {
    setBusy(true);
    try {
      setDetails(await customFetch<AgentAgreementDetails>(endpoint, { responseType: "json" }));
      setOpen(true);
    } catch { toast.error("Could not load agreement details. Please try again."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      setDetails(await customFetch<AgentAgreementDetails>(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details), responseType: "json",
      }));
      toast.success("Agent profile details saved for automatic filling.");
      setOpen(false);
    } catch { toast.error("Could not save agreement. Check the fields and try again."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <Button type="button" variant="outline" disabled={busy} onClick={() => open ? setOpen(false) : void load()}>
      {busy ? "Please wait..." : open ? "Close profile" : "Complete agent profile details"}
    </Button>
    {open && details && <div className="border rounded-xl p-4 space-y-4">
      <p className="text-sm">Sender ID / Agreement No.: <strong className="break-all">{agentId}</strong></p>
      <p className="text-sm text-muted-foreground">
        Company name, address, GST and contact details come from <a href="/admin/billing/settings" className="text-primary underline">Billing Settings</a>.
        The download date is filled automatically in Indian time. Complete missing details below before downloading.
        Agreement wording is managed once for all agents using Shared agent agreement at the top of Agent Management.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(labels).map(([key, label]) => <label key={key} className="text-sm font-medium space-y-1">
          <span>{label}</span>
          <Input value={details[key as keyof AgentAgreementDetails]} maxLength={key === "bank" || key === "address" ? 2000 : key === "commission" || key === "email" ? 300 : key === "cin" || key === "mobile" || key === "pan" ? 100 : 200}
            onChange={event => setDetails({ ...details, [key]: event.target.value })} />
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">Commission defaults to the agent's configured terms. Editing this agreement wording does not change payout settings.</p>
      <Button type="button" disabled={busy} onClick={save}>Save agent profile details</Button>
    </div>}
  </div>;
}
