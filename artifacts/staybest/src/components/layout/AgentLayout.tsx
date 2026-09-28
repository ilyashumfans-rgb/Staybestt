import { useLocation, Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, Building2, CalendarCheck, LogOut, ArrowLeft, Wallet, PlusCircle } from "lucide-react";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AgentLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function AgentLayout({ children, title }: AgentLayoutProps) {
  const [location] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { data: me, isLoading: meLoading } = useGetMe({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetMeQueryKey(),
    },
  });
  
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const navItems = [
    { href: "/agent", label: "Overview", icon: LayoutDashboard },
    { href: "/agent/bookings/new", label: "New Booking", icon: PlusCircle },
    { href: "/agent/bookings", label: "Booking History", icon: CalendarCheck },
    { href: "/agent/properties", label: "Submitted Properties", icon: Building2 },
    { href: "/agent/commissions", label: "Commissions & Payouts", icon: Wallet },
  ];

  if (!isLoaded || (isSignedIn && meLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30" data-testid="status-agent-portal-loading">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 text-center px-6" data-testid="status-agent-sign-in-required">
        <BrandLogo alt="StayBest" className="h-12 w-auto mb-6" />
        <h1 className="text-2xl font-bold text-secondary mb-2">Agent sign-in required</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Please sign in with your agent account to access the agent portal.
        </p>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/sign-in" data-testid="link-agent-sign-in">Sign In</Link>
        </Button>
      </div>
    );
  }

  if (me?.role !== "agent" && me?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 text-center px-6" data-testid="status-agent-access-denied">
        <BrandLogo alt="StayBest" className="h-12 w-auto mb-6" />
        <h1 className="text-2xl font-bold text-secondary mb-2">Agent access required</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Your account does not have permission to access the agent portal.
        </p>
        <Button asChild size="lg" variant="outline" className="rounded-full px-8">
          <Link href="/" data-testid="link-agent-return-home">Return to Home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden md:flex flex-col shrink-0">
        <div className="h-20 flex items-center px-6 border-b border-sidebar-border/50 shrink-0">
          <Link href="/" data-testid="link-agent-logo-home">
            <BrandLogo alt="StayBest Agent" className="h-10 w-auto" />
          </Link>
          <span className="ml-2 text-[10px] font-bold text-sidebar-primary tracking-widest uppercase border border-sidebar-primary px-1.5 py-0.5 rounded">Agent</span>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto hide-scrollbar">
          <p className="text-xs font-bold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-3">Portal</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.href === "/agent" ? location === "/agent" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} data-testid={`link-agent-nav-${item.href.replaceAll("/", "-").replace(/^-/, "")}`}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                    active 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}>
                    <item.icon className={cn("w-5 h-5", active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50")} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-sidebar-border/50 shrink-0">
          <button 
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive w-full transition-colors"
            data-testid="button-agent-sign-out"
          >
            <LogOut className="w-5 h-5 opacity-70" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h1 className="text-2xl font-serif font-bold text-secondary">{title}</h1>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors" data-testid="link-agent-back-to-site">
            <ArrowLeft className="w-4 h-4" /> Back to Main Site
          </Link>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
