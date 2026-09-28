import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { TicketPercent, Images, BellRing, Building, Gift } from "lucide-react";

export function MarketingNav() {
  const [location] = useLocation();

  const tabs = [
    { href: "/admin/marketing", label: "Discount Codes", icon: TicketPercent },
    { href: "/admin/marketing/banners", label: "Promo Banners", icon: Images },
    { href: "/admin/marketing/notifications", label: "Notifications", icon: BellRing },
    { href: "/admin/marketing/offices", label: "Offices", icon: Building },
    { href: "/admin/marketing/referrals", label: "Referrals", icon: Gift },
  ];

  return (
    <div className="flex gap-2 border-b border-border mb-8 overflow-x-auto pb-px">
      {tabs.map((tab) => {
        const active = location === tab.href;
        return (
          <Link key={tab.href} href={tab.href}>
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-secondary hover:border-border"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
