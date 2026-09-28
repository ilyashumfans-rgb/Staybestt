import { useLocation, Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, FileText, LogOut, ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { DocumentList } from "@/components/property-documents/DocumentList";

export default function StaffPropertyDocuments() {
  const [location] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  const isEmployee = me?.role === 'employee' || me?.role === 'admin';

  if (!isLoaded) return null;

  if (me && !isEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30 text-center px-4">
        <FileText className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-secondary mb-2">Staff access required</h2>
        <p className="text-muted-foreground mb-6">You must be an authorized StayBest employee to access Property Documents.</p>
        <Button asChild><Link href="/">Return Home</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 text-white border-r border-blue-800 hidden md:flex flex-col shrink-0">
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/">
            <BrandLogo alt="StayBest Staff" className="h-10 w-auto" />
          </Link>
          <span className="ml-2 text-xs font-bold text-blue-300 tracking-widest uppercase">Staff</span>
        </div>
        
        <div className="p-4 flex-1">
          <p className="text-xs font-bold text-blue-300/60 uppercase tracking-wider mb-4 px-3">Operations</p>
          <nav className="space-y-1">
            <Link href="/staff">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white cursor-pointer transition-colors">
                <LayoutDashboard className="w-5 h-5 text-blue-400" />
                Staff Desk
              </div>
            </Link>
            <Link href="/staff/property-documents">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-800 text-white cursor-pointer transition-colors">
                <FileText className="w-5 h-5 text-blue-300" />
                Property Docs
              </div>
            </Link>
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white w-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-blue-400" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h1 className="text-2xl font-serif font-bold text-secondary">Property Documents</h1>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Site
          </Link>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            <DocumentList role="employee" />
          </div>
        </div>
      </main>
    </div>
  );
}
