import { useUser, useClerk, Show } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { MapPin, Search, Heart, Calendar, Menu, X, User, LogOut, ChevronDown, LayoutDashboard, Briefcase, Bell } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGuestIdentity } from "@/hooks/use-auth";
import { useGetMe, getGetMeQueryKey, useListPropertyCategories } from "@workspace/api-client-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NavbarBell } from "./NavbarBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  
  const { data: me } = useGetMe({ 
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } 
  });
  const { data: propertyCategories = [] } = useListPropertyCategories();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isHome = location === "/";

  const navClass = cn(
    "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
    isScrolled || !isHome
      ? "bg-white/90 backdrop-blur-md border-border/80 py-3"
      : "bg-transparent border-transparent py-5"
  );

  const textClass = cn(
    "transition-colors",
    "text-secondary"
  );

  return (
    <header className={navClass}>
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 z-50">
          <BrandLogo
            variant="horizontal"
            alt="StayBest — Choose your own Space"
            className="h-9 md:h-12 transition-all duration-300"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center justify-center gap-8">
          <Link href="/search" className={cn("text-sm font-medium hover:text-primary transition-colors", textClass)}>
            Explore All
          </Link>
          {propertyCategories.map((category) => (
            <Link
              key={category.id}
              href={`/search?category=${encodeURIComponent(category.slug)}`}
              className={cn("text-sm font-medium hover:text-primary transition-colors", textClass)}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Show when="signed-in">
            <NavbarBell textClass={textClass} />
          </Show>
          <Link href="/wishlist" className={cn("p-2 rounded-full hover:bg-black/5 transition-colors", textClass)}>
            <Heart className="w-5 h-5" />
          </Link>
          
          <Show when="signed-in">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors", "hover:bg-accent")}>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {user?.firstName?.charAt(0) || user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase()}
                  </div>
                  <span className={cn("text-sm font-medium max-w-[120px] truncate", textClass)}>
                    {user?.firstName || user?.primaryEmailAddress?.emailAddress.split('@')[0]}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 opacity-70", textClass)} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer flex items-center gap-2">
                    <User className="w-4 h-4" /> My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-bookings" className="cursor-pointer flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> My Bookings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/wishlist" className="cursor-pointer flex items-center gap-2">
                    <Heart className="w-4 h-4" /> Wishlist
                  </Link>
                </DropdownMenuItem>
                
                {me?.role === 'partner' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/partner" className="cursor-pointer flex items-center gap-2 text-primary focus:text-primary font-medium">
                        <Briefcase className="w-4 h-4" /> Partner Dashboard
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                
                {me?.role === 'employee' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/staff" className="cursor-pointer flex items-center gap-2 text-blue-600 focus:text-blue-600 font-medium">
                        <LayoutDashboard className="w-4 h-4" /> Staff Desk
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {me?.role === 'admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/partner" className="cursor-pointer flex items-center gap-2 text-primary focus:text-primary font-medium">
                        <Briefcase className="w-4 h-4" /> Partner Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/staff" className="cursor-pointer flex items-center gap-2 text-blue-600 focus:text-blue-600 font-medium">
                        <LayoutDashboard className="w-4 h-4" /> Staff Desk
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectUrl: basePath || "/" })} className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>

          <Show when="signed-out">
            <Button asChild variant="outline" className="gap-2 rounded-full">
              <Link href="/sign-in">
                <User className="w-4 h-4" /> Sign In
              </Link>
            </Button>
          </Show>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden z-50 p-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6 text-secondary" />
          ) : (
            <Menu className={cn("w-6 h-6", textClass)} />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-white z-40 pt-24 px-6 flex flex-col gap-6 animate-in slide-in-from-top-4">
          <Link href="/search" className="text-xl font-serif text-secondary border-b pb-4" onClick={() => setMobileMenuOpen(false)}>
              Explore All
          </Link>
            {propertyCategories.map((category) => (
              <Link
                key={category.id}
                href={`/search?category=${encodeURIComponent(category.slug)}`}
                className="text-xl font-serif text-secondary border-b pb-4"
                onClick={() => setMobileMenuOpen(false)}
              >
                {category.name}
              </Link>
            ))}
          <Link href="/wishlist" className="text-xl font-serif text-secondary border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <Heart className="w-5 h-5" /> Saved Properties
          </Link>
          
          <Show when="signed-in">
            <Link href="/profile?section=notifications" className="text-xl font-serif text-secondary border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <Bell className="w-5 h-5" /> Notifications
            </Link>
            <Link href="/my-bookings" className="text-xl font-serif text-secondary border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <Calendar className="w-5 h-5" /> My Bookings
            </Link>
            {me?.role === 'partner' && (
              <Link href="/partner" className="text-xl font-serif text-primary border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                <Briefcase className="w-5 h-5" /> Partner Dashboard
              </Link>
            )}
            {me?.role === 'employee' && (
              <Link href="/staff" className="text-xl font-serif text-blue-600 border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                <LayoutDashboard className="w-5 h-5" /> Staff Desk
              </Link>
            )}
            <button onClick={() => { signOut({ redirectUrl: basePath || "/" }); setMobileMenuOpen(false); }} className="text-xl font-serif text-destructive border-b pb-4 flex items-center gap-2 text-left w-full">
              <LogOut className="w-5 h-5" /> Sign Out
            </button>
          </Show>
          
          <Show when="signed-out">
            <Link href="/sign-in" className="text-xl font-serif text-secondary border-b pb-4 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <User className="w-5 h-5" /> Sign In
            </Link>
          </Show>
        </div>
      )}
    </header>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}