import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Link } from "wouter";
import { formatPrice } from "@/lib/utils";

// Fix default marker icons under bundlers (Vite)
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapProperty {
  id: string | number;
  name: string;
  startingPrice: number;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}

interface SearchResultsMapProps {
  properties: MapProperty[];
}

export function SearchResultsMap({ properties }: SearchResultsMapProps) {
  const incomingParams = new URLSearchParams(window.location.search);
  const guestParams = new URLSearchParams();
  ["checkIn", "checkOut", "adults", "children", "guests"].forEach((key) => {
    const value = incomingParams.get(key);
    if (value) guestParams.set(key, value);
  });
  const located = properties.filter(
    (p): p is MapProperty & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null,
  );

  if (located.length === 0) {
    return (
      <div className="flex items-center justify-center h-[480px] rounded-2xl border border-dashed border-border bg-white text-muted-foreground text-sm">
        None of the matching properties have location coordinates yet.
      </div>
    );
  }

  const bounds = L.latLngBounds(located.map((p) => [p.latitude, p.longitude] as [number, number]));

  return (
    <div className="rounded-2xl overflow-hidden border border-border h-[480px] relative z-0">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [40, 40], maxZoom: 14 }}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located.map((p) => (
          <Marker key={p.id} position={[p.latitude, p.longitude]} icon={defaultIcon} title={p.name}>
            <Popup>
              <div className="min-w-[160px]">
                <Link href={`/property/${p.id}${guestParams.size ? `?${guestParams.toString()}` : ""}`} className="font-semibold text-secondary hover:text-primary block mb-1">
                  {p.name}
                </Link>
                {p.city && <div className="text-xs text-muted-foreground mb-1">{p.city}</div>}
                <div className="text-sm">
                  From <span className="font-bold">{formatPrice(p.startingPrice)}</span>/night
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
