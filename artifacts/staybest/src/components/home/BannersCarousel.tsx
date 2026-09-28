import { useEffect, useRef } from "react";
import { useRecordPromoBannerEvent, PromoBanner } from "@workspace/api-client-react";

export function BannersCarousel({ banners }: { banners: PromoBanner[] }) {
  const recordEvent = useRecordPromoBannerEvent();
  const impressed = useRef<Set<number>>(new Set());

  useEffect(() => {
    // A simple observer to trigger impression when a banner is visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute("data-id"));
            if (id && !impressed.current.has(id)) {
              impressed.current.add(id);
              const placement = entry.target.getAttribute("data-placement") ?? undefined;
              recordEvent.mutate({
                id,
                data: { eventType: "impression", idempotencyKey: `imp-${id}-${Date.now()}`, placement },
              }, {
                // Banner analytics must never interfere with browsing.
                onError: () => undefined,
              });
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll(".promo-banner-track").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [banners, recordEvent]);

  const handleTap = (id: number, placement?: string, url?: string | null) => {
    recordEvent.mutate({
      id,
      data: { eventType: "tap", idempotencyKey: `tap-${id}-${Date.now()}`, placement },
    }, {
      // Banner analytics must never interfere with browsing.
      onError: () => undefined,
    });
    if (url) {
      if (url.startsWith("http")) window.open(url, "_blank");
      else window.location.href = url;
    }
  };

  if (!banners || banners.length === 0) return null;

  return (
    <section className="py-8 bg-white border-b overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar">
          {banners.map((banner) => (
            <div
              key={banner.id}
              data-id={banner.id}
              data-placement={banner.placement}
              className="promo-banner-track shrink-0 w-[85%] md:w-[60%] lg:w-[45%] snap-center rounded-2xl overflow-hidden cursor-pointer relative"
              onClick={() => handleTap(banner.id, banner.placement, banner.linkUrl)}
            >
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="w-full aspect-[21/9] object-cover hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 p-6 text-white pointer-events-none">
                <h3 className="text-xl md:text-2xl font-bold mb-1 shadow-black drop-shadow-md">{banner.title}</h3>
                {banner.subtitle && <p className="text-sm text-white/90 shadow-black drop-shadow-md">{banner.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
