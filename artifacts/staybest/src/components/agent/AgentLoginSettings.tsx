import { useEffect, useState } from "react";
import { customFetch, type AdminAgentLogin } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AgentLoginSettings({ agentId, onAccountChanged }: {
  agentId: string;
  onAccountChanged: (id: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const endpoint = `/api/admin/agents/${encodeURIComponent(agentId)}/login`;

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setPassword(""); setVisible(false);
    customFetch<AdminAgentLogin>(endpoint).then(data => {
      if (!active) return;
      setUsername(data.username.includes("@") ? "" : data.username);
      setHasPassword(data.passwordEnabled);
    }).catch(() => { if (active) setError("Could not load login details. Please retry."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, reload]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const result = await customFetch<AdminAgentLogin>(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim().toLowerCase(), ...(password ? { password } : {}) }),
      });
      setUsername(result.username); setHasPassword(result.passwordEnabled);
      setPassword(""); setVisible(false);
      toast.success("Login details saved.");
      if (result.userId && result.userId !== agentId) onAccountChanged(result.userId);
    } catch (failure) {
      const message = (failure as { data?: { message?: unknown } })?.data?.message;
      setError(typeof message === "string" ? message : "Could not save login details. Please try again.");
    } finally { setSaving(false); }
  }

  return <section className="bg-white border rounded-xl p-5 text-secondary">
    <h3 className="font-bold mb-4">Agent Login and Password</h3>
    {loading ? <p className="text-sm">Loading...</p> : <form onSubmit={save} className="space-y-4 max-w-xl">
      <label className="block text-sm font-medium space-y-1">
        <span>Username</span>
        <Input required autoComplete="off" value={username} maxLength={30} minLength={3}
          pattern="[a-z0-9][a-z0-9._-]{2,29}" title="3–30 lowercase letters, numbers, dots, underscores or hyphens"
          placeholder="Enter username" disabled={saving} onChange={e => setUsername(e.target.value.toLowerCase())} />
      </label>
      <label className="block text-sm font-medium space-y-1">
        <span>Password</span>
        <div className="flex gap-2">
          <Input type={visible ? "text" : "password"} autoComplete="new-password" value={password}
            minLength={8} maxLength={128} required={!hasPassword} disabled={saving}
            placeholder={hasPassword ? "Enter a new password to change it" : "Enter password"}
            onChange={e => setPassword(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</Button>
        </div>
      </label>
      <p className="text-xs text-muted-foreground">
        At least 8 characters. {hasPassword ? "Leave blank to keep the current password. " : ""}
        Changing the password signs the agent out.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Login Details"}</Button>
        {error && <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Reload</Button>}
      </div>
    </form>}
  </section>;
}
