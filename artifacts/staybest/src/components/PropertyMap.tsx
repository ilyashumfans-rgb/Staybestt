import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// Fix default marker icons under bundlers (Vite)
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

export function PropertyMap({ latitude, longitude, name }: PropertyMapProps) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-serif font-bold text-secondary">Location</h2>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            Get directions <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
      </div>
      <div className="rounded-2xl overflow-hidden border border-border h-[320px] relative z-0">
        <MapContainer
          center={[latitude, longitude]}
          zoom={14}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[latitude, longitude]} icon={defaultIcon} title={name} />
        </MapContainer>
      </div>
    </section>
  );
}
