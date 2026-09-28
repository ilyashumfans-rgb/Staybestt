import { useState } from "react";
import { MarketingNav } from "@/components/admin/MarketingNav";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListPromoBannersQueryKey,
  useCreatePromoBanner,
  useDeletePromoBanner,
  useListPromoBanners,
  useUpdatePromoBanner,
  useGetBannerEventSummary,
  PromoBannerInputAudience,
  type PromoBanner,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PropertyImageUploader } from "@/components/PropertyImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Edit2, ImagePlus, Loader2, Plus, Trash2, Eye, MousePointerClick } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkUrl: "",
  city: "",
  placement: "home",
  audience: "all" as const,
  sortOrder: "0",
  startsAt: "",
  endsAt: "",
  active: true,
};

function BannerStats({ bannerId }: { bannerId: number }) {
  const { data: summaries, isLoading } = useGetBannerEventSummary();
  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  const summary = summaries?.find(s => s.bannerId === bannerId);
  if (!summary) return <span className="text-muted-foreground text-xs">No data</span>;

  return (
    <div className="flex gap-4 text-xs mt-3 text-muted-foreground font-medium bg-muted/30 p-2 rounded-lg">
      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {summary.impressions.toLocaleString()} views</span>
      <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> {summary.taps.toLocaleString()} taps</span>
    </div>
  );
}

export default function AdminPromoBanners() {
  const queryClient = useQueryClient();
  const { data: banners, isLoading } = useListPromoBanners({ query: { queryKey: getListPromoBannersQueryKey() } });
  const createBanner = useCreatePromoBanner();
  const updateBanner = useUpdatePromoBanner();
  const deleteBanner = useDeletePromoBanner();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const close = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListPromoBannersQueryKey() });
  const edit = (banner: PromoBanner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      imageUrl: banner.imageUrl,
      linkUrl: banner.linkUrl ?? "",
      city: banner.city ?? "",
      placement: banner.placement || "home",
      audience: (banner.audience || "all") as any,
      sortOrder: String(banner.sortOrder),
      startsAt: banner.startsAt?.slice(0, 16) ?? "",
      endsAt: banner.endsAt?.slice(0, 16) ?? "",
      active: banner.active,
    });
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const data = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      imageUrl: form.imageUrl,
      linkUrl: form.linkUrl.trim() || null,
      city: form.city.trim() || null,
      placement: form.placement.trim() || "home",
      audience: form.audience,
      sortOrder: Number(form.sortOrder) || 0,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      active: form.active,
    };
    const options = {
      onSuccess: () => {
        toast.success(editingId ? "Promotional banner updated" : "Promotional banner created");
        refresh();
        close();
      },
      onError: (error: Error) => toast.error(error.message || "Could not save promotional banner"),
    };
    if (editingId) updateBanner.mutate({ id: editingId, data }, options);
    else createBanner.mutate({ data }, options);
  };

  return (
    <AdminLayout title="Marketing Hub">
      <MarketingNav />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-muted-foreground">Add scheduled promotion sliders for the StayBest mobile app.</p>
        <Dialog open={open} onOpenChange={(value) => { if (!value) close(); else setOpen(true); }}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Banner</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Promotional Banner" : "Add Promotional Banner"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4 py-3">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
                <p className="font-semibold text-secondary">Recommended banner sizes</p>
                <p className="mt-1 text-muted-foreground">
                  Mobile application: <strong>1200 × 480 px</strong> (5:2 ratio)
                </p>
                <p className="text-muted-foreground">
                  Website: <strong>1600 × 600 px</strong> (8:3 ratio)
                </p>
              </div>
              <PropertyImageUploader mainValue={form.imageUrl} onMainChange={(imageUrl) => setForm({ ...form, imageUrl })} showGallery={false} />
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold mb-1 block">Title</label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><label className="text-xs font-bold mb-1 block">City (optional)</label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="All cities" /></div>
              </div>
              <div><label className="text-xs font-bold mb-1 block">Subtitle</label><Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold mb-1 block">Placement</label>
                  <select
                    value={form.placement}
                    onChange={(e) => setForm({ ...form, placement: e.target.value })}
                    className="w-full h-10 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  >
                    <option value="home">Home Page</option>
                    <option value="search">Search Results</option>
                    <option value="checkout">Checkout</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block">Audience</label>
                  <select
                    value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value as any })}
                    className="w-full h-10 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  >
                    {Object.values(PromoBannerInputAudience).map(aud => (
                      <option key={aud} value={aud}>{aud.charAt(0).toUpperCase() + aud.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div><label className="text-xs font-bold mb-1 block">App link or website URL</label><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/list?city=Bengaluru" /></div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div><label className="text-xs font-bold mb-1 block">Order</label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
                <div><label className="text-xs font-bold mb-1 block">Starts</label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
                <div><label className="text-xs font-bold mb-1 block">Ends</label><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> <span className="text-sm font-medium">Active</span></label>
              <div className="flex justify-end gap-2 pt-3 border-t"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" disabled={!form.imageUrl || createBanner.isPending || updateBanner.isPending}>Save Banner</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {banners?.map((banner) => (
            <div key={banner.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${banner.active ? "" : "opacity-60"}`}>
              <img src={banner.imageUrl} alt={banner.title} className="w-full aspect-[2/1] object-cover" />
              <div className="p-4">
                <div className="flex justify-between gap-3"><h3 className="font-bold">{banner.title}</h3><Badge variant={banner.active ? "default" : "secondary"}>{banner.active ? "Active" : "Inactive"}</Badge></div>
                {banner.subtitle && <p className="text-sm text-muted-foreground mt-1">{banner.subtitle}</p>}
                <p className="text-xs text-muted-foreground mt-3">{banner.city || "All cities"} · Order {banner.sortOrder}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs font-normal capitalize">Placement: {banner.placement || "home"}</Badge>
                  <Badge variant="outline" className="text-xs font-normal capitalize">Audience: {banner.audience || "all"}</Badge>
                </div>
                <BannerStats bannerId={banner.id} />
              </div>
              <div className="p-3 border-t flex gap-2"><Button variant="outline" size="sm" className="flex-1" onClick={() => edit(banner)}><Edit2 className="w-4 h-4 mr-2" /> Edit</Button><Button variant="outline" size="sm" className="text-red-600" onClick={() => { if (confirm("Delete this banner?")) deleteBanner.mutate({ id: banner.id }, { onSuccess: () => { toast.success("Banner deleted"); refresh(); } }); }}><Trash2 className="w-4 h-4" /></Button></div>
            </div>
          ))}
          {!banners?.length && <div className="md:col-span-2 xl:col-span-3 text-center py-16 border border-dashed rounded-2xl bg-white"><ImagePlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No promotional banners yet.</p></div>}
        </div>
      )}
    </AdminLayout>
  );
}
