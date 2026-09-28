import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListCmsPages,
  useUpdateCmsPage,
  getListCmsPagesQueryKey,
  getGetCmsPageQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Eye, Pencil } from "lucide-react";
import { CmsContent } from "@/components/CmsContent";
import { format } from "date-fns";

export default function AdminCms() {
  const queryClient = useQueryClient();
  const { data: pages, isLoading } = useListCmsPages({
    query: { queryKey: getListCmsPagesQueryKey() },
  });
  const updatePage = useUpdateCmsPage();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  const selected = pages?.find((p) => p.slug === selectedSlug) ?? null;

  useEffect(() => {
    if (!selectedSlug && pages?.length) setSelectedSlug(pages[0].slug);
  }, [pages, selectedSlug]);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setContent(selected.content);
      setPreview(false);
    }
  }, [selected?.slug]);

  const dirty = selected ? title !== selected.title || content !== selected.content : false;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    updatePage.mutate(
      { slug: selected.slug, data: { title: title.trim(), content } },
      {
        onSuccess: () => {
          toast.success("Page saved");
          queryClient.invalidateQueries({ queryKey: getListCmsPagesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCmsPageQueryKey(selected.slug) });
        },
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || err?.message || "Failed to save"),
      },
    );
  };

  return (
    <AdminLayout title="Site Pages">
      <p className="text-muted-foreground mb-6">
        Edit the content shown on the public site pages (About, Contact, FAQ, Privacy Policy,
        Terms &amp; Conditions).
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* Page list */}
          <div className="bg-white border rounded-2xl p-3">
            {pages?.map((p) => (
              <button
                key={p.slug}
                onClick={() => setSelectedSlug(p.slug)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                  p.slug === selectedSlug
                    ? "bg-primary/10 text-primary"
                    : "text-secondary hover:bg-muted"
                }`}
              >
                <FileText className={`w-4 h-4 shrink-0 ${p.slug === selectedSlug ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
              </button>
            ))}
          </div>

          {/* Editor */}
          {selected && (
            <form onSubmit={handleSave} className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  /{selected.slug} • Last updated {format(new Date(selected.updatedAt), "dd MMM yyyy, HH:mm")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setPreview((v) => !v)}
                >
                  {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {preview ? "Edit" : "Preview"}
                </Button>
              </div>

              <div>
                <label className="text-xs font-bold text-secondary mb-1 block">Page Title</label>
                <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-bold text-secondary mb-1 block">Content</label>
                {preview ? (
                  <div className="border border-input rounded-xl p-4 min-h-[420px] bg-muted/20">
                    <CmsContent content={content} />
                  </div>
                ) : (
                  <textarea
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full border border-input rounded-xl p-4 min-h-[420px] font-mono text-sm outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1.5">
                  Formatting: start a line with <code className="bg-muted px-1 rounded">## </code> for a
                  heading, <code className="bg-muted px-1 rounded">- </code> for a bullet, wrap text in{" "}
                  <code className="bg-muted px-1 rounded">**bold**</code>, and separate paragraphs with a
                  blank line.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="submit" disabled={!dirty || updatePage.isPending}>
                  {updatePage.isPending ? "Saving..." : dirty ? "Save Changes" : "Saved"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
