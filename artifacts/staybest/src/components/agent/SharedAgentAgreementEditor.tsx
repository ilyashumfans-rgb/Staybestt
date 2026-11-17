import { useState } from "react";
import { customFetch, type AgentAgreementTemplate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function SharedAgentAgreementEditor() {
  const [value, setValue] = useState<AgentAgreementTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = "/api/admin/agent-agreement-template";
  async function load() {
    setBusy(true);
    try { setValue(await customFetch<AgentAgreementTemplate>(endpoint)); }
    catch { toast.error("Could not load the shared agreement."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!window.confirm("Apply this agreement to all agents' future downloads? Existing signed copies will not change.")) return;
    setBusy(true);
    try {
      await customFetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      toast.success("Shared agreement updated for all agents."); setValue(null);
    } catch { toast.error("Could not save the shared agreement."); }
    finally { setBusy(false); }
  }
  return <section className="bg-white border rounded-xl p-5 mb-6 space-y-4 text-secondary">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Shared agent agreement</h2><p className="text-sm text-muted-foreground">Edit once here. All agents use this wording with their own details filled automatically.</p></div>
      <Button variant="outline" disabled={busy} onClick={() => value ? setValue(null) : void load()}>{value ? "Close" : "Edit shared agreement"}</Button>
    </div>
    {value && <>
      <p className="text-sm">Company name, address, GST and contact information come from Billing Settings. Complete these additional company details once.</p>
      <div className="grid sm:grid-cols-3 gap-4">
        {(["cin", "signatory", "designation"] as const).map(key => <label key={key} className="text-sm space-y-1 block">
          <span>{key === "cin" ? "Company CIN" : key === "signatory" ? "Authorised signatory" : "Designation"}</span>
          <Input value={value[key]} maxLength={key === "cin" ? 100 : 200} disabled={busy} onChange={e => setValue({ ...value, [key]: e.target.value })} />
        </label>)}
      </div>
      <label className="block text-sm space-y-2"><span>Agreement wording for all agents</span>
        <textarea value={value.template} maxLength={50000} disabled={busy} className="w-full min-h-96 border rounded-lg p-3 font-mono text-xs bg-white"
          onChange={e => setValue({ ...value, template: e.target.value })} />
      </label>
      <p className="text-xs text-muted-foreground">Keep double-brace placeholders to fill names, dates and agent IDs automatically. Existing signed documents remain unchanged.</p>
      <Button disabled={busy || value.template.trim().length < 100} onClick={save}>{busy ? "Saving..." : "Save agreement for all agents"}</Button>
    </>}
  </section>;
}
