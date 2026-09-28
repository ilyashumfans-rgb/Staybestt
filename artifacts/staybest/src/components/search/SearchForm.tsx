import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Calendar, Loader2, LocateFixed, MapPin, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListLocations } from "@workspace/api-client-react";
import { toast } from "sonner";

export function SearchForm({ compact = false }: { compact?: boolean }) {
  const [currentLocation] = useLocation();
  const { data: locations } = useListLocations();
  const initialParams = useMemo(() => {
    const queryIndex = currentLocation.indexOf("?");
    return new URLSearchParams(
      queryIndex >= 0
        ? currentLocation.slice(queryIndex + 1)
        : window.location.search.replace(/^\?/, ""),
    );
  }, [currentLocation]);
  const [country, setCountry] = useState(initialParams.get("country") ?? "");
  const [state, setState] = useState(initialParams.get("state") ?? "");
  const [city, setCity] = useState(initialParams.get("city") ?? "");
  const [checkIn, setCheckIn] = useState(initialParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(initialParams.get("checkOut") ?? "");
  const [adults, setAdults] = useState(
    initialParams.get("adults") ?? initialParams.get("guests") ?? "2",
  );
  const [children, setChildren] = useState(initialParams.get("children") ?? "0");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    setCountry(initialParams.get("country") ?? "");
    setState(initialParams.get("state") ?? "");
    setCity(initialParams.get("city") ?? "");
    setCheckIn(initialParams.get("checkIn") ?? "");
    setCheckOut(initialParams.get("checkOut") ?? "");
    setAdults(initialParams.get("adults") ?? initialParams.get("guests") ?? "2");
    setChildren(initialParams.get("children") ?? "0");
  }, [initialParams]);

  const countries = useMemo(
    () => [...new Set((locations ?? []).map((item) => item.country))].sort(),
    [locations],
  );
  const states = useMemo(
    () => [...new Set(
      (locations ?? [])
        .filter((item) => item.country === country)
        .map((item) => item.state),
    )].sort(),
    [country, locations],
  );
  const cities = useMemo(
    () => [...new Set(
      (locations ?? [])
        .filter((item) => item.country === country && item.state === state)
        .map((item) => item.city),
    )].sort(),
    [country, locations, state],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (country) params.append("country", country);
    if (state) params.append("state", state);
    if (city) params.append("city", city);
    if (checkIn) params.append("checkIn", checkIn);
    if (checkOut) params.append("checkOut", checkOut);
    params.append("adults", adults);
    params.append("children", children);
    params.append("guests", String(Number(adults) + Number(children)));
    
    window.location.assign(`${import.meta.env.BASE_URL}search?${params.toString()}`);
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast.error("Location services are not supported by this browser.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const params = new URLSearchParams({
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
          radiusKm: "50",
          sort: "distance",
        });
        if (checkIn) params.set("checkIn", checkIn);
        if (checkOut) params.set("checkOut", checkOut);
        params.set("adults", adults);
        params.set("children", children);
        params.set("guests", String(Number(adults) + Number(children)));
        window.location.assign(`${import.meta.env.BASE_URL}search?${params.toString()}`);
      },
      () => {
        setIsLocating(false);
        toast.error("We couldn't access your location. Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    );
  };

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2 w-full">
        <LocationSelects
          country={country}
          state={state}
          city={city}
          countries={countries}
          states={states}
          cities={cities}
          onCountry={(value) => { setCountry(value); setState(""); setCity(""); }}
          onState={(value) => { setState(value); setCity(""); }}
          onCity={setCity}
          compact
        />
        <select
          value={adults}
          onChange={(event) => setAdults(event.target.value)}
          aria-label="Adults"
          className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium"
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count} {count === 1 ? "Adult" : "Adults"}</option>
          ))}
        </select>
        <select
          value={children}
          onChange={(event) => setChildren(event.target.value)}
          aria-label="Children"
          className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium"
        >
          {Array.from({ length: 7 }, (_, index) => index).map((count) => (
            <option key={count} value={count}>{count} {count === 1 ? "Child" : "Children"}</option>
          ))}
        </select>
        <Button type="button" variant="outline" className="shrink-0" onClick={handleNearMe} disabled={isLocating}>
          {isLocating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LocateFixed className="w-4 h-4 mr-2" />} Near Me
        </Button>
        <Button type="submit" className="shrink-0">
          <Search className="w-4 h-4 mr-2" /> Search
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur-xl p-4 md:p-4 rounded-3xl shadow-2xl w-full flex flex-col md:flex-row gap-2 relative z-20">
      <div className="flex-1 md:flex-[1.6] relative bg-muted/50 md:bg-transparent rounded-2xl p-2 md:p-0">
        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 px-3 block">Destination</label>
        <LocationSelects
          country={country}
          state={state}
          city={city}
          countries={countries}
          states={states}
          cities={cities}
          onCountry={(value) => { setCountry(value); setState(""); setCity(""); }}
          onState={(value) => { setState(value); setCity(""); }}
          onCity={setCity}
        />
      </div>
      
      <div className="w-px bg-border/50 hidden md:block my-2 mx-1" />
      
      <div className="flex gap-2 md:flex-1">
        <div className="flex-1 relative bg-muted/50 md:bg-transparent rounded-2xl p-2 md:p-0">
          <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 px-3 block">Check in</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
            <Input 
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="pl-10 border-none bg-transparent hover:bg-black/5 focus-visible:bg-black/5 h-12 text-base rounded-xl font-medium"
            />
          </div>
        </div>
        
        <div className="flex-1 relative bg-muted/50 md:bg-transparent rounded-2xl p-2 md:p-0">
          <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 px-3 block">Check out</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
            <Input 
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="pl-10 border-none bg-transparent hover:bg-black/5 focus-visible:bg-black/5 h-12 text-base rounded-xl font-medium"
            />
          </div>
        </div>
      </div>

      <div className="w-px bg-border/50 hidden md:block my-2 mx-1" />
      
      <div className="w-full md:w-60 relative bg-muted/50 md:bg-transparent rounded-2xl p-2 md:p-0">
        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 px-3 block">Guests</label>
        <div className="grid grid-cols-2 gap-1">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <select
              value={adults}
              onChange={(event) => setAdults(event.target.value)}
              aria-label="Adults"
              className="w-full pl-9 pr-2 h-12 bg-transparent hover:bg-black/5 focus:bg-black/5 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count} Adult{count === 1 ? "" : "s"}</option>
              ))}
            </select>
          </div>
          <select
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            aria-label="Children"
            className="w-full px-2 h-12 bg-transparent hover:bg-black/5 focus:bg-black/5 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {Array.from({ length: 7 }, (_, index) => index).map((count) => (
              <option key={count} value={count}>{count} Child{count === 1 ? "" : "ren"}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 md:mt-0 flex items-stretch md:pl-2">
        <Button size="lg" type="button" variant="outline" onClick={handleNearMe} disabled={isLocating} className="mr-2 h-auto min-h-[64px] rounded-2xl px-5 font-bold">
          {isLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5 mr-2" />} {!isLocating && "Near Me"}
        </Button>
        <Button size="lg" type="submit" className="w-full md:w-auto h-auto min-h-[64px] rounded-2xl text-lg font-bold shadow-[0_0_40px_-10px_rgba(255,107,0,0.8)] hover:shadow-[0_0_60px_-15px_rgba(255,107,0,1)] px-8 group">
          <Search className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" /> Search
        </Button>
      </div>
    </form>
  );
}

function LocationSelects({
  country,
  state,
  city,
  countries,
  states,
  cities,
  onCountry,
  onState,
  onCity,
  compact = false,
}: {
  country: string;
  state: string;
  city: string;
  countries: string[];
  states: string[];
  cities: string[];
  onCountry: (value: string) => void;
  onState: (value: string) => void;
  onCity: (value: string) => void;
  compact?: boolean;
}) {
  const selectClass = compact
    ? "h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm text-secondary outline-none focus:ring-2 focus:ring-primary"
    : "h-12 min-w-0 flex-1 rounded-xl border-none bg-transparent px-3 text-sm font-medium outline-none hover:bg-black/5 focus:ring-2 focus:ring-primary";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <MapPin className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
      <select value={country} onChange={(event) => onCountry(event.target.value)} className={selectClass}>
        <option value="">Country</option>
        {countries.map((item) => <option key={item}>{item}</option>)}
      </select>
      <select value={state} onChange={(event) => onState(event.target.value)} className={selectClass} disabled={!country}>
        <option value="">State</option>
        {states.map((item) => <option key={item}>{item}</option>)}
      </select>
      <select value={city} onChange={(event) => onCity(event.target.value)} className={selectClass} disabled={!state}>
        <option value="">City</option>
        {cities.map((item) => <option key={item}>{item}</option>)}
      </select>
    </div>
  );
}