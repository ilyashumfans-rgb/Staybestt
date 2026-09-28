import { AgentLayout } from "@/components/layout/AgentLayout";
import { useState } from "react";
import { useSearchProperties, getSearchPropertiesQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Loader2, Search, MapPin, Star, Building } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AgentNewBooking() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { data: properties, isLoading } = useSearchProperties(
    { q: debouncedQuery, sort: "popular" },
    { query: { queryKey: getSearchPropertiesQueryKey({ q: debouncedQuery, sort: "popular" }) } }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
  };

  return (
    <AgentLayout title="New Booking">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-border mb-8">
        <h2 className="text-lg font-bold text-secondary mb-4">Find a Property to Book</h2>
        <form onSubmit={handleSearch} className="flex gap-4" data-testid="form-agent-property-search">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              className="pl-12 h-14 text-base rounded-xl"
              placeholder="Search by city, property name, or landmark..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-agent-property-search"
            />
          </div>
          <Button type="submit" className="h-14 px-8 text-base" data-testid="button-agent-property-search">Search</Button>
        </form>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {properties?.length === 0 ? (
            <div className="col-span-full py-20 text-center">
              <Building className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-secondary mb-2">No properties found</h3>
              <p className="text-muted-foreground">Try adjusting your search criteria.</p>
            </div>
          ) : properties?.map((property) => (
            <Link key={property.id} href={`/property/${property.id}`} data-testid={`link-agent-book-property-${property.id}`}>
              <div className="bg-white border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group flex flex-col h-full">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img 
                    src={property.imageUrl} 
                    alt={property.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                  />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded text-xs font-bold text-secondary uppercase tracking-wider">
                    {property.category}
                  </div>
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <h3 className="font-bold text-secondary text-lg leading-tight line-clamp-2">{property.name}</h3>
                    <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-bold text-amber-700">{property.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-4">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="truncate">{property.area}, {property.city}</span>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-border flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Starting from</p>
                      <p className="text-lg font-bold text-primary">{formatPrice(property.startingPrice)}<span className="text-sm font-normal text-muted-foreground">/night</span></p>
                    </div>
                    <Button size="sm" variant="secondary" data-testid={`button-agent-book-property-${property.id}`}>Book Now</Button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AgentLayout>
  );
}
