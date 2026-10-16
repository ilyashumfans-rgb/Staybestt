import { useEffect, useRef, useState } from "react";

export type PropertySection = { id: string; label: string };

export const PROPERTY_SECTIONS: PropertySection[] = [
  { id: "overview", label: "Overview" },
  { id: "highlights", label: "Highlights" },
  { id: "refund-policy", label: "Refund Policy" },
  { id: "rooms", label: "Spaces" },
  { id: "reviews", label: "Reviews" },
  { id: "amenities", label: "Amenities" },
  { id: "meals", label: "Meals" },
  { id: "location", label: "Location" },
  { id: "experiences", label: "Experiences" },
  { id: "faqs", label: "FAQ's" },
];

const OFFSET = 140;

export function PropertySectionNav({ sections = PROPERTY_SECTIONS }: { sections?: PropertySection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const lockUntil = useRef(0);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < lockUntil.current) return;
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top - OFFSET <= 1) current = s.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = sections[sections.length - 1]?.id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  useEffect(() => {
    const item = active ? itemRefs.current[active] : null;
    const nav = navRef.current;
    if (item && nav) {
      // Scroll only the horizontal strip; scrollIntoView also moves the page.
      const delta = item.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollTo({ left: nav.scrollLeft + delta - (nav.clientWidth - item.clientWidth) / 2, behavior: "smooth" });
    }
  }, [active]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    lockUntil.current = Date.now() + 900;
    const top = el.getBoundingClientRect().top + window.scrollY - (OFFSET - 10);
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="sticky top-[61px] md:top-[73px] z-40 bg-white border-b border-border" data-testid="nav-property-sections">
      <div className="container mx-auto px-4">
        <nav ref={navRef} aria-label="Property sections" className="flex gap-6 md:gap-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map(s => {
            const isActive = s.id === active;
            return (
              <button
                key={s.id}
                ref={el => { itemRefs.current[s.id] = el; }}
                type="button"
                onClick={() => go(s.id)}
                aria-current={isActive ? "true" : undefined}
                data-testid={`nav-section-${s.id}`}
                className={`relative shrink-0 whitespace-nowrap py-4 text-sm transition-colors ${isActive ? "text-secondary font-semibold" : "text-muted-foreground hover:text-secondary"}`}
              >
                {s.label}
                <span className={`absolute left-0 right-0 bottom-0 h-[2px] bg-secondary origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
