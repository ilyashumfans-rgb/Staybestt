import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminLogin } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const adminLogin = useAdminLogin();

  useEffect(() => {
    if (localStorage.getItem("staybest-admin-key")) {
      setLocation("/admin/dashboard");
    }
  }, [setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    adminLogin.mutate({ data: { username, password } }, {
      onSuccess: (result) => {
        localStorage.setItem("staybest-admin-key", result.token);
        window.location.href = "/admin/dashboard";
      }
    });
  };

  return (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-primary" />

        <div className="flex justify-center mb-8">
          <BrandLogo alt="StayBest Admin" className="h-16 w-auto" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-secondary flex items-center justify-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Admin Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-2">Sign in with your admin credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">Username</label>
            <Input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="h-12 bg-muted/50 border-transparent focus-visible:bg-white focus-visible:border-primary"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">Password</label>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-12 bg-muted/50 border-transparent focus-visible:bg-white focus-visible:border-primary"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20"
            disabled={adminLogin.isPending}
          >
            {adminLogin.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
          </Button>

          {adminLogin.isError && (
            <p className="text-destructive text-sm text-center font-medium">
              Invalid username or password. Please try again.
            </p>
          )}
        </form>
      </div>

      <p className="text-white/40 text-xs mt-8">&copy; {new Date().getFullYear()} StayBest Administration</p>
    </div>
  );
}
