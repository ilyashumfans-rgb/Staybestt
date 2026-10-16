import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegisterPartnerAccount } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Copy, Download, ShieldCheck, Clock, KeyRound } from "lucide-react";

type Creds = { username: string; password: string; message: string };

function errMessage(err: any, fallback: string) {
  return err?.data?.message || err?.message || fallback;
}

export default function PartnerRegister() {
  const [, setLocation] = useLocation();
  const register = useRegisterPartnerAccount({ mutation: { gcTime: 0 } });
  const resetRef = useRef(register.reset);
  resetRef.current = register.reset;
  const [form, setForm] = useState({ name: "", phone: "", businessName: "", city: "" });
  const [error, setError] = useState("");
  const [creds, setCreds] = useState<Creds | null>(null);
  const [saved, setSaved] = useState(false);

  // Clear mutation data on unmount so credentials never linger in memory/cache.
  useEffect(() => () => resetRef.current(), []);

  useEffect(() => {
    if (!creds || saved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [creds, saved]);

  const loginUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/partners`;
  const credText = creds
    ? `StayBest Partner Login\nLogin page: ${loginUrl}\nUsername: ${creds.username}\nPassword: ${creds.password}\n\nYour account must be approved by the StayBest team before you can open the Partner Dashboard.`
    : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const data = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      businessName: form.businessName.trim(),
      city: form.city.trim(),
    };
    try {
      const res = await register.mutateAsync({ data });
      setCreds({ username: res.username, password: res.password, message: res.message });
      register.reset();
      setForm({ name: "", phone: "", businessName: "", city: "" });
    } catch (err) {
      setError(errMessage(err, "Could not register. Please check your details and try again."));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credText);
      toast.success("Credentials copied");
    } catch {
      toast.error("Copy failed — please write them down");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([credText], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "staybest-partner-login.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => {
    setCreds(null);
    setSaved(false);
    register.reset();
    setLocation("/partners");
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-orange-50/60 via-white to-white">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo alt="StayBest" className="h-9 w-auto" />
          </Link>
          <Link href="/partners" className="text-sm font-medium text-muted-foreground hover:text-primary" data-testid="link-partner-login">
            Partner Login
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <section className="md:pt-6">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-4 py-1.5 mb-5">
            Become a StayBest partner
          </span>
          <h1 className="font-serif text-4xl font-black text-secondary leading-tight">
            Register your hotel in <span className="text-primary">two minutes</span>
          </h1>
          <p className="text-muted-foreground mt-4">
            No email needed. We generate a username and password for you on the spot.
          </p>
          <ol className="mt-8 space-y-5">
            {[
              { icon: KeyRound, t: "Get your login instantly", d: "Your username and password appear once, right after you register. Save them." },
              { icon: Clock, t: "Wait for approval", d: "The StayBest team reviews every application before the Partner Dashboard opens." },
              { icon: ShieldCheck, t: "Sign in and list properties", d: "Once approved, sign in at the partner login page and add your first property." },
            ].map((s, i) => (
              <li key={s.t} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary text-white flex items-center justify-center shrink-0 font-bold text-sm">
                  {i + 1}
                </div>
                <div>
                  <p className="font-bold text-secondary flex items-center gap-2"><s.icon className="w-4 h-4 text-primary" /> {s.t}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white border rounded-2xl shadow-sm p-6 md:p-8">
          {creds ? (
            <div className="space-y-5" data-testid="panel-credentials">
              <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Save these now — they are shown only once.</p>
                  <p className="mt-1">We don't use email, so these cannot be recovered or resent. Refreshing or leaving this page will lose them.</p>
                </div>
              </div>
              <div className="bg-secondary text-white rounded-xl p-5 font-mono text-sm space-y-3">
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider font-sans">Username</p>
                  <p className="text-lg font-bold break-all" data-testid="text-username">{creds.username}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider font-sans">Password</p>
                  <p className="text-lg font-bold break-all text-orange-300" data-testid="text-password">{creds.password}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="gap-2" onClick={copy} data-testid="button-copy-credentials">
                  <Copy className="w-4 h-4" /> Copy
                </Button>
                <Button variant="outline" className="gap-2" onClick={download} data-testid="button-download-credentials">
                  <Download className="w-4 h-4" /> Download
                </Button>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-blue-800 text-sm">
                <p className="font-bold mb-1">Approval required</p>
                <p>{creds.message || "Your application is pending review."} You can sign in only after the StayBest team approves your account. No email will be sent — check back at the partner login page.</p>
              </div>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} data-testid="checkbox-saved" className="mt-0.5" />
                <span>I have saved my username and password somewhere safe.</span>
              </label>
              <Button size="lg" className="w-full rounded-full gap-2" disabled={!saved} onClick={finish} data-testid="button-continue-login">
                Continue to login <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="font-bold text-secondary text-xl">Partner registration</h2>
              {([
                ["name", "Your name", "e.g. Ravi Menon", 2, 100, "name"],
                ["phone", "Phone number", "e.g. 98470 12345", 7, 20, "tel"],
                ["businessName", "Hotel / business name", "e.g. Lakeview Residency", 2, 150, "organization"],
                ["city", "City", "e.g. Kochi", 2, 100, "address-level2"],
              ] as const).map(([k, label, ph, min, max, ac]) => (
                <div key={k}>
                  <label className="text-sm font-medium mb-1 block" htmlFor={`reg-${k}`}>{label}</label>
                  <Input
                    id={`reg-${k}`}
                    required
                    minLength={min}
                    maxLength={max}
                    type={k === "phone" ? "tel" : "text"}
                    placeholder={ph}
                    autoComplete={ac}
                    value={form[k]}
                    onChange={set(k)}
                    data-testid={`input-${k}`}
                  />
                </div>
              ))}
              {error && <p role="alert" className="text-sm text-destructive bg-red-50 border border-red-100 rounded-lg p-3" data-testid="text-register-error">{error}</p>}
              <Button type="submit" size="lg" className="w-full rounded-full gap-2" disabled={register.isPending} data-testid="button-register">
                {register.isPending ? "Registering..." : "Register"} <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Already registered? <Link href="/partners" className="text-primary font-semibold">Sign in</Link>
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
