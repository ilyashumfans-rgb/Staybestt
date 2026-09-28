import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { ReferralsSection } from "@/components/profile/ReferralsSection";
import { NotificationsSection } from "@/components/profile/NotificationsSection";
import {
  useGetMe,
  useUpdateMe,
  useListBookings,
  useCancelBooking,
  useGetCmsPage,
  getGetMeQueryKey,
  getListBookingsQueryKey,
  getGetCmsPageQueryKey,
  useCreateMyReferralCode,
  useListMyReferralRewards,
  useUpdateNotificationPreferences,
  useGetNotificationPreferences,
  getGetNotificationPreferencesQueryKey,
  useListNotifications,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { CmsContent } from "@/components/CmsContent";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { bookingReferenceLabel, bookingStatusLabel } from "@/lib/booking-display";
import {
  User,
  CalendarClock,
  History,
  Heart,
  Sparkles,
  Bell,
  KeyRound,
  LifeBuoy,
  Phone,
  HelpCircle,
  ShieldCheck,
  FileText,
  LogOut,
  Loader2,
  ChevronRight,
  MapPin,
  XCircle,
  CheckCircle,
  Clock,
  Gift,
} from "lucide-react";

type SectionId =
  | "profile"
  | "upcoming"
  | "history"
  | "ai"
  | "notifications"
  | "referrals"
  | "password"
  | "help"
  | "contact"
  | "faq"
  | "privacy"
  | "terms";

const MENU: { id: SectionId | "wishlist" | "logout"; label: string; icon: any; group?: string }[] = [
  { id: "profile", label: "Edit Profile", icon: User, group: "Account" },
  { id: "upcoming", label: "Upcoming Bookings", icon: CalendarClock },
  { id: "history", label: "Booking History", icon: History },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "ai", label: "AI Preferences", icon: Sparkles, group: "Settings" },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "referrals", label: "Refer & Earn", icon: Gift },
  { id: "password", label: "Change Password", icon: KeyRound },
  { id: "help", label: "Help & Support", icon: LifeBuoy, group: "Support" },
  { id: "contact", label: "Contact Us", icon: Phone },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "privacy", label: "Privacy Policy", icon: ShieldCheck, group: "Legal" },
  { id: "terms", label: "Terms & Conditions", icon: FileText },
  { id: "logout", label: "Logout", icon: LogOut, group: " " },
];

const CATEGORIES = ["luxury", "prime", "budget", "package"];

// Renders a CMS-managed page (edited from Admin → Site Pages) inside a profile section.
function CmsSection({ slug }: { slug: string }) {
  const { data: page, isLoading, isError } = useGetCmsPage(slug, {
    query: { queryKey: getGetCmsPageQueryKey(slug) },
  });
  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-primary" />;
  if (isError || !page)
    return <p className="text-sm text-muted-foreground">This content is currently unavailable. Please try again later.</p>;
  return (
    <div className="max-w-2xl">
      <CmsContent content={page.content} />
    </div>
  );
}

export default function ProfilePage() {
  const { isSignedIn, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SectionId>(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    return requested && MENU.some((m) => m.id === requested)
      ? (requested as SectionId)
      : "profile";
  });

  const { data: me, isLoading: meLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn },
  });
  const updateMe = useUpdateMe();
  const { data: bookings, isLoading: bookingsLoading } = useListBookings(undefined, {
    query: { queryKey: getListBookingsQueryKey(), enabled: !!isSignedIn },
  });
  const cancelBooking = useCancelBooking();

  const [name, setName] = useState("");
  const [prefs, setPrefs] = useState<Record<string, any>>({});

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPrefs(me.preferences ?? {});
    }
  }, [me]);

  const savePrefs = (next: Record<string, any>, message = "Preferences saved") => {
    setPrefs(next);
    updateMe.mutate(
      { data: { preferences: next } },
      {
        onSuccess: () => {
          toast.success(message);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: any) => toast.error(err?.message || "Failed to save"),
      },
    );
  };

  if (!isLoaded) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isSignedIn) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-muted/30 px-4">
          <div className="bg-white p-8 rounded-3xl shadow-lg border max-w-md w-full text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-secondary mb-2">Your Profile</h1>
            <p className="text-muted-foreground mb-8">Sign in to manage your profile, bookings, and preferences.</p>
            <Button asChild className="w-full h-12 text-base">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (bookings ?? []).filter((b) =>
    (b.status === "confirmed" && b.checkOut >= today) || b.status === "pending_payment"
  );
  const history = (bookings ?? []).filter((b) => !(b.status === "confirmed" && b.checkOut >= today));

  const handleCancel = (id: number, bookingRef: string | null | undefined) => {
    if (!me) return;
    if (!bookingRef) {
      toast.error("This booking has no reference yet because payment is still pending.");
      return;
    }
    if (!confirm("Cancel this booking? Cancellation is subject to the hotel's policy.")) return;
    cancelBooking.mutate(
      { id, data: { email: me.email, bookingRef } },
      {
        onSuccess: () => {
          toast.success("Booking cancelled");
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        },
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || err?.message || "Cancellation not allowed"),
      },
    );
  };

  const BookingList = ({ items, empty, allowCancel }: { items: typeof upcoming; empty: string; allowCancel?: boolean }) => (
    <div className="space-y-4">
      {bookingsLoading ? (
        <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarClock className="w-8 h-8 mx-auto mb-3 opacity-40" />
          {empty}
        </div>
      ) : (
        items.map((b) => {
          const statusColor =
            b.status === "confirmed" ? "bg-green-100 text-green-800" :
            b.status === "pending_payment" ? "bg-amber-100 text-amber-800" :
            b.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700";
          const StatusIcon = b.status === "confirmed" ? CheckCircle : b.status === "cancelled" || b.status === "expired" ? XCircle : Clock;
          return (
            <div key={b.id} className="bg-white border rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
              <img src={b.propertyImageUrl} alt={b.propertyName} className="w-full sm:w-40 h-28 object-cover rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-secondary">{b.propertyName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> {b.propertyCity} • {b.roomName}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`${statusColor} border-none flex items-center gap-1 capitalize shrink-0`}>
                     <StatusIcon className="w-3 h-3" /> {bookingStatusLabel(b.status)}
                  </Badge>
                </div>
                <p className="text-sm mt-2 text-secondary">
                  {format(new Date(b.checkIn), "dd MMM yyyy")} → {format(new Date(b.checkOut), "dd MMM yyyy")}
                  <span className="mx-2 text-muted-foreground">•</span>
                  {b.guests} {b.guests === 1 ? "guest" : "guests"}
                  <span className="mx-2 text-muted-foreground">•</span>
                  <span className="font-bold">₹{b.totalAmount.toLocaleString("en-IN")}</span>
                </p>
                <div className="flex items-center justify-between mt-3">
                   <p className="text-xs text-muted-foreground">{bookingReferenceLabel(b.bookingRef, b.status)}</p>
                  {allowCancel && b.status === "confirmed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      disabled={cancelBooking.isPending}
                      onClick={() => handleCancel(b.id, b.bookingRef)}
                    >
                      Cancel Booking
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      {allowCancel && (
        <p className="text-xs text-muted-foreground">
          Cancellations are subject to hotel policy: hotels with free cancellation can be cancelled until check-in; others allow cancellation up to 48 hours before check-in.
        </p>
      )}
    </div>
  );

  const Toggle = ({ id, label, desc }: { id: string; label: string; desc: string }) => (
    <div className="flex items-center justify-between gap-4 py-4 border-b last:border-0">
      <div>
        <p className="font-semibold text-secondary text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch
        checked={prefs[id] !== false}
        onCheckedChange={(v) => savePrefs({ ...prefs, [id]: v }, v ? "Notifications on" : "Notifications off")}
      />
    </div>
  );

  const sectionTitle = MENU.find((m) => m.id === section)?.label ?? "";

  return (
    <Layout>
      <div className="bg-secondary pt-24 pb-12">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl shrink-0">
            {(me?.name || me?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-white">{me?.name || "My Profile"}</h1>
            <p className="text-white/70 text-sm">{me?.email}</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 min-h-[60vh]">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 max-w-6xl mx-auto">
          {/* Menu */}
          <aside className="bg-white border rounded-2xl p-3 h-fit lg:sticky lg:top-24">
            {MENU.map((item) => {
              const Icon = item.icon;
              const active = item.id === section;
              return (
                <div key={item.id}>
                  {item.group && <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{item.group}</p>}
                  {item.id === "wishlist" ? (
                    <Link href="/wishlist" className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-muted transition-colors">
                      <span className="flex items-center gap-3"><Icon className="w-4 h-4 text-primary" /> {item.label}</span>
                      <ChevronRight className="w-4 h-4 opacity-40" />
                    </Link>
                  ) : item.id === "logout" ? (
                    <button
                      onClick={() => signOut().then(() => navigate("/"))}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      <Icon className="w-4 h-4" /> {item.label}
                    </button>
                  ) : (
                    <button
                      onClick={() => setSection(item.id as SectionId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-secondary hover:bg-muted"}`}
                    >
                      <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} /> {item.label}
                    </button>
                  )}
                </div>
              );
            })}
          </aside>

          {/* Content */}
          <main className="bg-white border rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-serif font-bold text-secondary mb-6">{sectionTitle}</h2>

            {meLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <>
                {section === "profile" && (
                  <form
                    className="space-y-5 max-w-md"
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateMe.mutate(
                        { data: { name: name.trim() } },
                        {
                          onSuccess: () => {
                            toast.success("Profile updated");
                            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                          },
                          onError: (err: any) => toast.error(err?.message || "Failed to update"),
                        },
                      );
                    }}
                  >
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1.5 block">Full Name</label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1.5 block">Email</label>
                      <Input value={me?.email ?? ""} disabled className="bg-muted/50" />
                      <p className="text-xs text-muted-foreground mt-1.5">Email is managed by your sign-in account.</p>
                    </div>
                    <Button type="submit" disabled={updateMe.isPending}>
                      {updateMe.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                )}

                {section === "upcoming" && <BookingList items={upcoming} empty="No upcoming bookings. Time to plan your next getaway!" allowCancel />}
                {section === "history" && <BookingList items={history} empty="No past bookings yet." />}

                {section === "ai" && (
                  <div className="space-y-6 max-w-lg">
                    <p className="text-sm text-muted-foreground -mt-2">
                      Tell us how you like to travel — we use this to personalize your recommendations.
                    </p>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1.5 block">Travel Style</label>
                      <select
                        value={prefs.travelStyle ?? ""}
                        onChange={(e) => savePrefs({ ...prefs, travelStyle: e.target.value })}
                        className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select...</option>
                        <option value="relaxation">Relaxation & Wellness</option>
                        <option value="adventure">Adventure & Outdoors</option>
                        <option value="family">Family Trips</option>
                        <option value="romantic">Romantic Getaways</option>
                        <option value="business">Business Travel</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-2 block">Preferred Stay Types</label>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map((c) => {
                          const selected: string[] = prefs.preferredCategories ?? [];
                          const on = selected.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() =>
                                savePrefs({
                                  ...prefs,
                                  preferredCategories: on ? selected.filter((x) => x !== c) : [...selected, c],
                                })
                              }
                              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors capitalize ${on ? "bg-primary text-white border-primary" : "bg-white text-secondary border-input hover:border-primary"}`}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1.5 block">Budget per Night</label>
                      <select
                        value={prefs.budgetRange ?? ""}
                        onChange={(e) => savePrefs({ ...prefs, budgetRange: e.target.value })}
                        className="w-full h-10 border border-input rounded-md px-3 outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select...</option>
                        <option value="under-3000">Under ₹3,000</option>
                        <option value="3000-8000">₹3,000 – ₹8,000</option>
                        <option value="8000-15000">₹8,000 – ₹15,000</option>
                        <option value="above-15000">Above ₹15,000</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1.5 block">Anything else? (dietary needs, accessibility, etc.)</label>
                      <Input
                        value={prefs.dietaryNotes ?? ""}
                        onChange={(e) => setPrefs({ ...prefs, dietaryNotes: e.target.value })}
                        onBlur={() => savePrefs({ ...prefs })}
                        placeholder="e.g. vegetarian meals, ground-floor rooms"
                      />
                    </div>
                  </div>
                )}

                {section === "notifications" && <NotificationsSection />}

                {section === "referrals" && <ReferralsSection />}

                {section === "password" && (
                  <div className="max-w-md space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Your password and sign-in methods are managed securely through your StayBest account settings.
                    </p>
                    <Button onClick={() => openUserProfile()} className="gap-2">
                      <KeyRound className="w-4 h-4" /> Manage Password & Security
                    </Button>
                  </div>
                )}

                {section === "help" && (
                  <div className="space-y-4 max-w-lg text-sm text-secondary leading-relaxed">
                    <p>We're here to help with anything about your bookings or account.</p>
                    <ul className="space-y-3">
                      <li className="flex gap-3"><HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Browse the <button className="text-primary underline font-medium" onClick={() => setSection("faq")}>FAQ</button> for instant answers.</li>
                      <li className="flex gap-3"><Phone className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Call us on +91 98765 43210 (9 AM – 9 PM IST, all days).</li>
                      <li className="flex gap-3"><LifeBuoy className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Email hello@staybestt.com — we reply within 24 hours.</li>
                    </ul>
                  </div>
                )}

                {section === "contact" && <CmsSection slug="contact" />}
                {section === "faq" && <CmsSection slug="faq" />}
                {section === "privacy" && <CmsSection slug="privacy" />}
                {section === "terms" && <CmsSection slug="terms" />}
              </>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
}
