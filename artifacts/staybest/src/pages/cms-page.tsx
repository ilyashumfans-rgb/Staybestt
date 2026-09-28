import { Layout } from "@/components/layout/Layout";
import { useGetCmsPage, getGetCmsPageQueryKey } from "@workspace/api-client-react";
import { CmsContent } from "@/components/CmsContent";
import { Loader2 } from "lucide-react";

export default function CmsPage({ slug }: { slug: string }) {
  const { data: page, isLoading, isError } = useGetCmsPage(slug, {
    query: { queryKey: getGetCmsPageQueryKey(slug) },
  });

  return (
    <Layout>
      <div className="bg-secondary pt-24 pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-white">
            {page?.title ?? "\u00A0"}
          </h1>
        </div>
      </div>
      <div className="container mx-auto px-4 py-12 min-h-[50vh]">
        <div className="max-w-3xl mx-auto bg-white border rounded-2xl p-6 md:p-10">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : isError || !page ? (
            <p className="text-muted-foreground text-center py-16">
              This page is currently unavailable. Please try again later.
            </p>
          ) : (
            <CmsContent content={page.content} />
          )}
        </div>
      </div>
    </Layout>
  );
}
