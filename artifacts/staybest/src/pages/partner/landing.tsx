import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk, useSignIn } from "@clerk/react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useGetMe, getGetMeQueryKey, usePartnerPasswordLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Building2,
  CalendarCheck,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  LayoutDashboard,
  Eye,
  EyeOff,
} from "lucide-react";

const perks = [
  {
    icon: Building2,
    title: "List your hotel or resort",
    text: "Register your property with photos, amenities, and policies. It goes live as soon as the StayBest team approves it.",
  },
  {
    icon: CalendarCheck,
    title: "Manage bookings & rooms",
    text: "See every booking in one place, update room types, availability, and pricing whenever you need.",
  },
  {
    icon: BarChart3,
    title: "Track your performance",
    text: "A live dashboard shows today's bookings, revenue, and occupancy for all your properties.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    text: "Only you and the StayBest team can manage your property. Sign in with the email registered with StayBest.",
  },
];

export default function PartnerLanding() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { openSignIn, signOut } = useClerk();
  const { signIn } = useSignIn();
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const partnerLogin = usePartnerPasswordLogin();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;
    const id = loginId.trim();
    if (!id || !loginPassword) return;
    setLoggingIn(true);
    try {
      // Clear any leftover session (e.g. from a deleted account) so the
      // fresh sign-in can't be blocked by it.
      if (isSignedIn) {
        await signOut({ redirectUrl: undefined });
      }
      // Our server checks the password and returns a one-time sign-in ticket.
      const { ticket } = await partnerLogin.mutateAsync({ data: { login: id, password: loginPassword } });
      const { error } = await signIn.ticket({ ticket });
      if (error) {
        toast.error(error.message || "Could not sign you in. Please try again.");
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        toast.error(finalizeError.message || "Could not start your session. Please try again.");
        return;
      }
      setLocation("/partner");
    } catch {
      toast.error("Wrong username or password");
    } finally {
      setLoggingIn(false);
    }
  };
  const { data: me } = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() },
  });

  const isPartner = me?.role === "partner" || me?.role === "admin";

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/60 via-white to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo alt="StayBest" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary">
              Main site
            </Link>
            {isLoaded && (isSignedIn ? (
              isPartner ? (
                <Button size="sm" className="gap-2" onClick={() => setLocation("/partner")}>
                  <LayoutDashboard className="w-4 h-4" /> Partner Dashboard
                </Button>
              ) : null
            ) : (
              <Button size="sm" onClick={() => openSignIn()}>
                Partner Sign In
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-4 py-1.5 mb-5">
          StayBest for Hotel Partners
        </span>
        <h1 className="font-serif text-4xl md:text-5xl font-black text-secondary leading-tight max-w-3xl mx-auto">
          Grow your hotel or resort with <span className="text-primary">StayBest</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mt-5">
          Manage your properties, rooms, pricing, and bookings from one dashboard — and reach
          travellers across India.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          {isSignedIn ? (
            isPartner ? (
              <Button size="lg" className="gap-2 rounded-full px-8" onClick={() => setLocation("/partner")}>
                Go to Partner Dashboard <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4 text-amber-800 text-sm max-w-md">
                Your account isn't registered as a hotel partner yet. Contact the StayBest team to
                get your email registered, then sign in again here.
              </div>
            )
          ) : (
            <div className="w-full max-w-md mx-auto bg-white border rounded-2xl shadow-sm p-6 text-left">
              <h2 className="font-bold text-secondary text-lg mb-4 text-center">Partner Sign In</h2>
              <form onSubmit={handlePasswordLogin} className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Username or email</label>
                  <Input
                    required
                    placeholder="e.g. tajresort or owner@hotel.com"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Password</label>
                  <div className="relative">
                    <Input
                      required
                      type={showPassword ? "text" : "password"}
                      placeholder="Your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                      aria-label={showPassword ? "Hide password" : "View password"}
                      title={showPassword ? "Hide password" : "View password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" size="lg" className="w-full gap-2 rounded-full" disabled={loggingIn}>
                  {loggingIn ? "Signing in..." : "Sign In"} <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-border flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px bg-border flex-1" />
              </div>
              <Button variant="outline" size="lg" className="w-full rounded-full" onClick={() => openSignIn()}>
                Sign in with Google / Email OTP
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Use the login given to you by the StayBest team.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Perks */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-2 gap-5">
          {perks.map((p) => (
            <div key={p.title} className="bg-white border rounded-2xl p-6 shadow-sm flex gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-secondary">{p.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-12 text-sm text-muted-foreground">
          New to StayBest? Ask the StayBest team to register your email as a partner — then sign in
          here and register your first property.
        </div>
      </section>
    </div>
  );
}
