import { AirVent, Building, Check, Clapperboard, Coffee, Flame, Gamepad2, GlassWater, Music, Refrigerator, Tent, Trees, Tv, UtensilsCrossed, Waves, Wifi, Wine, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const AMENITY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  pool: { icon: Waves, label: "Pool" }, lawn: { icon: Trees, label: "Lawn" }, breakfast: { icon: Coffee, label: "Breakfast" },
  wifi: { icon: Wifi, label: "WiFi" }, theatre: { icon: Clapperboard, label: "Theatre" }, bbq: { icon: UtensilsCrossed, label: "BBQ" },
  bonfire: { icon: Flame, label: "Bonfire" }, gazebo: { icon: Tent, label: "Gazebo" }, games: { icon: Gamepad2, label: "Games" },
  bar: { icon: Wine, label: "Bar" }, tv: { icon: Tv, label: "TV" }, music: { icon: Music, label: "Music" },
  balcony: { icon: Building, label: "Balcony" }, ac: { icon: AirVent, label: "AC" }, refrigerator: { icon: Refrigerator, label: "Refrigerator" },
  water: { icon: GlassWater, label: "Water" }, check: { icon: Check, label: "Check" },
};

export function AmenityIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = (AMENITY_ICONS[icon] ?? AMENITY_ICONS.check).icon;
  return (
    <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-secondary/25 text-secondary", className)}>
      <Icon className="h-4 w-4" strokeWidth={1.6} />
    </span>
  );
}
