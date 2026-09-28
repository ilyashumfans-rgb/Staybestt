import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { setAdminTokenGetter, useCustomerPasswordLogin } from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, useClerk, useSignIn } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

// Client Pages
import Home from '@/pages/home';
import Search from '@/pages/search';
import PropertyDetail from '@/pages/property';
import BookingFlow from '@/pages/booking';
import BookingDetails from '@/pages/booking-details';
import MyBookings from '@/pages/my-bookings';
import Wishlist from '@/pages/wishlist';
import MobilePayment from '@/pages/mobile-payment';

// Admin Pages
import AdminLogin from '@/pages/admin/login';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminBookings from '@/pages/admin/bookings';
import AdminBilling from '@/pages/admin/billing';
import AdminBillingSettings from '@/pages/admin/billing/settings';
import AdminBillingNew from '@/pages/admin/billing/new';
import AdminBillingDetail from '@/pages/admin/billing/detail';
import AdminProperties from '@/pages/admin/properties';
import AdminPropertyDocuments from '@/pages/admin/property-documents';
import AdminLocations from '@/pages/admin/locations';
import AdminDestinations from '@/pages/admin/destinations';
import AdminPropertyCategories from '@/pages/admin/property-categories';
import AdminRooms from '@/pages/admin/rooms';
import AdminOffers from '@/pages/admin/offers';
import AdminPromoBanners from '@/pages/admin/promo-banners';
import AdminMarketingNotifications from '@/pages/admin/marketing-notifications';
import AdminMarketingOffices from '@/pages/admin/marketing-offices';
import AdminMarketingReferrals from '@/pages/admin/marketing-referrals';
import AdminMarketing from '@/pages/admin/marketing';
import AdminAgents from '@/pages/admin/agents';
import AdminCms from '@/pages/admin/cms';
import CmsPage from '@/pages/cms-page';
import AdminUsers from '@/pages/admin/users';
import AdminVendors from '@/pages/admin/vendors';
import AdminCustomers from '@/pages/admin/customers';
import AdminHr from '@/pages/admin/hr';
import AdminReports from '@/pages/admin/reports';
import ProfilePage from '@/pages/profile';

// Partner Pages
import PartnerLanding from '@/pages/partner/landing';
import PartnerDashboard from '@/pages/partner/dashboard';
import PartnerBookings from '@/pages/partner/bookings';
import PartnerProperties from '@/pages/partner/properties';
import PartnerFinance from '@/pages/partner/finance';
import PartnerProfile from '@/pages/partner/profile';

// Agent Pages
import AdminCommissions from '@/pages/admin/commissions';
import AgentDashboard from '@/pages/agent/dashboard';
import AgentBookings from '@/pages/agent/bookings/index';
import AgentNewBooking from '@/pages/agent/bookings/new';
import AgentProperties from '@/pages/agent/properties';
import AgentCommissions from '@/pages/agent/commissions';

// Staff Pages
import StaffDashboard from '@/pages/staff/dashboard';
import StaffPropertyDocuments from '@/pages/staff/property-documents';

// Web Clerk requests use the session cookie automatically. Keep the legacy
// admin key on a separate, route-scoped getter so it cannot override a
// customer's Clerk session on payment or other customer endpoints.
setAdminTokenGetter(() => localStorage.getItem("staybest-admin-key"));

// REQUIRED — canonical Clerk wiring, do not modify.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/staybest-brand-tagline-1789131885718.png`,
  },
  variables: {
    colorPrimary: '#ff6b00',
    colorForeground: '#0b1a30',
    colorMutedForeground: '#5a6a7e',
    colorDanger: '#dc2626',
    colorBackground: '#ffffff',
    colorInput: '#f5f6f8',
    colorInputForeground: '#0b1a30',
    colorNeutral: '#0b1a30',
    fontFamily: "'Outfit', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#0b1a30] font-bold',
    headerSubtitle: 'text-[#5a6a7e]',
    socialButtonsBlockButtonText: 'text-[#0b1a30] font-medium',
    formFieldLabel: 'text-[#0b1a30] font-semibold',
    footerActionLink: 'text-[#ff6b00] font-semibold hover:text-[#e05e00]',
    footerActionText: 'text-[#5a6a7e]',
    dividerText: 'text-[#5a6a7e]',
    identityPreviewEditButton: 'text-[#ff6b00]',
    formFieldSuccessText: 'text-emerald-600',
    alertText: 'text-[#0b1a30]',
    logoBox: 'h-14 justify-center',
    logoImage: 'h-14 w-auto',
    socialButtonsBlockButton: 'border border-slate-200 hover:bg-slate-50',
    formButtonPrimary: 'bg-[#ff6b00] hover:bg-[#e05e00] text-white font-bold shadow-lg shadow-orange-500/20',
    formFieldInput: 'bg-[#f5f6f8] border-transparent focus:border-[#ff6b00] focus:bg-white',
    footerAction: 'justify-center',
    dividerLine: 'bg-slate-200',
    alert: 'bg-red-50 border border-red-100',
    otpCodeFieldInput: 'border-slate-300',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401) {
          if (window.location.pathname.includes('/admin')) {
            localStorage.removeItem('staybest-admin-key');
            window.location.href = `${basePath}/admin`;
          }
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: any) => {
        if (error?.status === 401 && window.location.pathname.includes('/admin')) {
          localStorage.removeItem('staybest-admin-key');
          window.location.href = `${basePath}/admin`;
        }
      },
    },
  },
});

function SignInPage() {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  const destination = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : `${basePath}/`;
  const { signIn } = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const customerLogin = useCustomerPasswordLogin();
  const onCustomerLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signIn || busy) return;
    setBusy(true);
    setError('');
    try {
      const { ticket } = await customerLogin.mutateAsync({ data: { username, password } });
      const result = await signIn.ticket({ ticket });
      if (result.error) throw result.error;
      const finished = await signIn.finalize();
      if (finished.error) throw finished.error;
      window.location.assign(destination);
    } catch (failure: any) {
      setError(failure?.data?.message || failure?.message || 'Could not sign in');
    } finally {
      setBusy(false);
      setPassword('');
    }
  };
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[#0b1a30] px-4 py-10">
      <form onSubmit={onCustomerLogin} className="w-full max-w-sm rounded-xl bg-white p-5 space-y-3">
        <h2 className="text-lg font-semibold">Customer username login</h2>
        <input className="w-full rounded border p-2" aria-label="Username" autoComplete="username" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <input className="w-full rounded border p-2" aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="w-full rounded bg-[#0b1a30] p-2 text-white disabled:opacity-50" disabled={busy}>{busy ? 'Signing in…' : 'Sign in with username'}</button>
      </form>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={destination} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b1a30] px-4 py-10">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <Switch>
      {/* Auth Routes */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      {/* Admin Routes */}
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/bookings" component={AdminBookings} />
      <Route path="/admin/billing" component={AdminBilling} />
      <Route path="/admin/billing/settings" component={AdminBillingSettings} />
      <Route path="/admin/billing/new" component={AdminBillingNew} />
      <Route path="/admin/billing/:id" component={AdminBillingDetail} />
      <Route path="/admin/properties" component={AdminProperties} />
      <Route path="/admin/property-documents" component={AdminPropertyDocuments} />
      <Route path="/admin/locations" component={AdminLocations} />
      <Route path="/admin/destinations" component={AdminDestinations} />
      <Route path="/admin/property-categories" component={AdminPropertyCategories} />
      <Route path="/admin/properties/:id/rooms" component={AdminRooms} />
      <Route path="/admin/offers" component={AdminOffers} />
      <Route path="/admin/promo-banners" component={AdminPromoBanners} />
      <Route path="/admin/marketing" component={AdminMarketing} />
      <Route path="/admin/marketing/banners" component={AdminPromoBanners} />
      <Route path="/admin/marketing/notifications" component={AdminMarketingNotifications} />
      <Route path="/admin/marketing/offices" component={AdminMarketingOffices} />
      <Route path="/admin/marketing/referrals" component={AdminMarketingReferrals} />
      <Route path="/admin/agents" component={AdminAgents} />
      <Route path="/admin/cms" component={AdminCms} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/vendors" component={AdminVendors} />
      <Route path="/admin/customers" component={AdminCustomers} />
      <Route path="/admin/hr" component={AdminHr} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/commissions" component={AdminCommissions} />

      {/* Partner Routes */}
      <Route path="/partners" component={PartnerLanding} />
      <Route path="/partner" component={PartnerDashboard} />
      <Route path="/partner/bookings" component={PartnerBookings} />
      <Route path="/partner/properties" component={PartnerProperties} />
      <Route path="/partner/finance" component={PartnerFinance} />
      <Route path="/partner/profile" component={PartnerProfile} />

      {/* Agent Routes */}
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/agent/bookings" component={AgentBookings} />
      <Route path="/agent/bookings/new" component={AgentNewBooking} />
      <Route path="/agent/properties" component={AgentProperties} />
      <Route path="/agent/commissions" component={AgentCommissions} />

      {/* Staff Routes */}
      <Route path="/staff" component={StaffDashboard} />
      <Route path="/staff/property-documents" component={StaffPropertyDocuments} />

      {/* Client Routes */}
      {/* Public hosted handoff; it must remain before the catch-all route and
          never require a Clerk sign-in. */}
      <Route path="/mobile-payment" component={MobilePayment} />
      <Route path="/" component={Home} />
      <Route path="/search" component={Search} />
      <Route path="/property/:id" component={PropertyDetail} />
      <Route path="/booking/:propertyId/:roomId" component={BookingFlow} />
      <Route path="/my-bookings/:id" component={BookingDetails} />
      <Route path="/my-bookings" component={MyBookings} />
      <Route path="/wishlist" component={Wishlist} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/about">{() => <CmsPage slug="about" />}</Route>
      <Route path="/contact">{() => <CmsPage slug="contact" />}</Route>
      <Route path="/faq">{() => <CmsPage slug="faq" />}</Route>
      <Route path="/privacy">{() => <CmsPage slug="privacy" />}</Route>
      <Route path="/terms">{() => <CmsPage slug="terms" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to manage your stays',
          },
        },
        signUp: {
          start: {
            title: 'Create your StayBest account',
            subtitle: 'Book faster, save favourites, track your trips',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
