import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { LayoutDashboard, Building2, CalendarCheck, Tags, LogOut, ArrowLeft, Users, Store, UserRound, BriefcaseBusiness, BarChart3, FileText, TicketPercent, MapPin, Images, Wallet, Contact, Menu, Receipt } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!localStorage.getItem("staybest-admin-key")) {
      setLocation("/admin");
    }
  }, [location, setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("staybest-admin-key");
    window.location.href = "/admin";
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
    { href: "/admin/billing", label: "Billing", icon: Receipt },
    { href: "/admin/properties", label: "Properties", icon: Building2 },
    { href: "/admin/property-documents", label: "Property Docs", icon: FileText },
    { href: "/admin/property-categories", label: "Property Categories", icon: Tags },
    { href: "/admin/locations", label: "Locations", icon: MapPin },
    { href: "/admin/destinations", label: "Destinations", icon: MapPin },
    { href: "/admin/offers", label: "Offers", icon: Tags },
    { href: "/admin/promo-banners", label: "Promo Banners", icon: Images },
    { href: "/admin/cms", label: "Site Pages", icon: FileText },
    { href: "/admin/agents", label: "Agent Management", icon: Contact },
    { href: "/admin/marketing", label: "Marketing", icon: TicketPercent },
    { href: "/admin/commissions", label: "Commercial Terms", icon: Wallet },
    { href: "/admin/users", label: "Data Management", icon: Users },
    { href: "/admin/vendors", label: "Vendors", icon: Store },
    { href: "/admin/customers", label: "Customers", icon: UserRound },
    { href: "/admin/hr", label: "HR", icon: BriefcaseBusiness },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden md:flex flex-col">
        <div className="h-20 flex items-center px-6 border-b border-sidebar-border/50">
          <Link href="/">
            <BrandLogo alt="StayBest Admin" className="h-10 w-auto" />
          </Link>
        </div>
        
        <div className="p-4 flex-1">
          <p className="text-xs font-bold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-3">Management</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    active 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground" 
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

        <div className="p-4 border-t border-sidebar-border/50">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-sidebar-foreground/50" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="md:hidden p-2 -ml-2 text-muted-foreground hover:bg-muted/50 rounded-md">
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r-sidebar-border text-sidebar-foreground">
                <SheetHeader className="h-20 flex justify-center px-6 border-b border-sidebar-border/50 sr-only">
                  <SheetTitle>Admin Navigation</SheetTitle>
                </SheetHeader>
                <div className="h-20 flex items-center px-6 border-b border-sidebar-border/50">
                  <Link href="/">
                    <BrandLogo alt="StayBest Admin" className="h-10 w-auto" />
                  </Link>
                </div>

                <div className="p-4 overflow-y-auto" style={{ height: 'calc(100vh - 5rem - 65px)' }}>
                  <p className="text-xs font-bold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-3">Management</p>
                  <nav className="space-y-1">
                    {navItems.map((item) => {
                      const active = location.startsWith(item.href);
                      return (
                        <Link key={item.href} href={item.href}>
                          <div className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                            active
                              ? "bg-sidebar-primary text-sidebar-primary-foreground"
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

                <div className="p-4 border-t border-sidebar-border/50 absolute bottom-0 left-0 right-0 bg-sidebar">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors"
                  >
                    <LogOut className="w-5 h-5 text-sidebar-foreground/50" />
                    Sign Out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <h1 className="text-xl md:text-2xl font-serif font-bold text-secondary truncate">{title}</h1>
          </div>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary hidden sm:flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Site
          </Link>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
