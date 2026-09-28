import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, Building2, CalendarCheck, LogOut, ArrowLeft, Wallet, UserCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PartnerLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function PartnerLayout({ children, title }: PartnerLayoutProps) {
  const [location] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const navItems = [
    { href: "/partner", label: "Overview", icon: LayoutDashboard },
    { href: "/partner/bookings", label: "Bookings", icon: CalendarCheck },
    { href: "/partner/properties", label: "My Properties", icon: Building2 },
    { href: "/partner/finance", label: "Finance", icon: Wallet },
    { href: "/partner/profile", label: "Profile", icon: UserCircle },
  ];

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 text-center px-6">
        <BrandLogo alt="StayBest" className="h-12 w-auto mb-6" />
        <h1 className="text-2xl font-bold text-secondary mb-2">Partner sign-in required</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Please sign in with your partner account to access the hotel management dashboard.
        </p>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/partners">Go to Partner Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-secondary text-white border-r border-secondary/20 hidden md:flex flex-col">
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/">
            <BrandLogo alt="StayBest Partner" className="h-10 w-auto" />
          </Link>
          <span className="ml-2 text-xs font-bold text-primary tracking-widest uppercase">Partner</span>
        </div>
        
        <div className="p-4 flex-1">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-4 px-3">Management</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.href === "/partner" ? location === "/partner" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    active 
                      ? "bg-primary text-white" 
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}>
                    <item.icon className={cn("w-5 h-5", active ? "text-white" : "text-white/50")} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white w-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-white/50" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h1 className="text-2xl font-serif font-bold text-secondary">{title}</h1>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Site
          </Link>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
