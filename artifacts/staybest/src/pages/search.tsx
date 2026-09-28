import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { PropertyCard } from "@/components/property/PropertyCard";
import { useListPropertyCategories, useSearchProperties } from "@workspace/api-client-react";
import { SearchForm } from "@/components/search/SearchForm";
import { Filter, SlidersHorizontal, Loader2, Search as SearchIcon, Map as MapIcon, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchResultsMap } from "@/components/SearchResultsMap";

export default function Search() {
  const [location, setLocation] = useLocation();
  const searchString = location.includes("?")
    ? location.slice(location.indexOf("?") + 1)
    : window.location.search.replace(/^\?/, "");
  const searchParams = new URLSearchParams(searchString);
  
  const q = searchParams.get("q") || undefined;
  const city = searchParams.get("city") || undefined;
  const country = searchParams.get("country") || undefined;
  const state = searchParams.get("state") || undefined;
  const category = searchParams.get("category") || undefined;
  const minPrice = searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : undefined;
  const maxPrice = searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined;
  const minRating = searchParams.get("minRating") ? Number(searchParams.get("minRating")) : undefined;
  const amenities = searchParams.get("amenities") || undefined;
  const freeCancellation = searchParams.get("freeCancellation") === "true";
  const breakfastIncluded = searchParams.get("breakfastIncluded") === "true";
  const sort = searchParams.get("sort") || undefined;
  const latitude = searchParams.get("latitude") ? Number(searchParams.get("latitude")) : undefined;
  const longitude = searchParams.get("longitude") ? Number(searchParams.get("longitude")) : undefined;
  const radiusKm = searchParams.get("radiusKm") ? Number(searchParams.get("radiusKm")) : undefined;
  const { data: propertyCategories = [] } = useListPropertyCategories();
  const selectedCategoryName = propertyCategories.find((item) => item.slug === category)?.name;

  const { data: properties, isLoading } = useSearchProperties({
    q,
    city,
    country,
    state,
    category,
    minPrice,
    maxPrice,
    minRating,
    amenities,
    freeCancellation: freeCancellation || undefined,
    breakfastIncluded: breakfastIncluded || undefined,
    sort,
    latitude,
    longitude,
    radiusKm,
  });

  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(searchString);
    if (newSort) {
      params.set("sort", newSort);
    } else {
      params.delete("sort");
    }
    setLocation(`/search?${params.toString()}`);
  };

  const handleFilterToggle = (key: string, value: string | boolean) => {
    const params = new URLSearchParams(searchString);
    if (typeof value === 'boolean') {
      if (value) params.set(key, "true");
      else params.delete(key);
    } else {
      const current = params.get(key);
      if (current === value) {
        params.delete(key); // toggle off
      } else {
        params.set(key, value);
      }
    }
    setLocation(`/search?${params.toString()}`);
  };

  return (
    <Layout>
      <div className="bg-secondary text-white pt-24 pb-8">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold mb-6">
            {latitude != null && longitude != null
              ? "Hotels Near You"
              : q
              ? `Search results for "${q}"`
              : city
                ? `Properties in ${city}`
                : state
                  ? `Properties in ${state}`
                  : country
                    ? `Properties in ${country}`
                    : category
                      ? `${selectedCategoryName ?? category.charAt(0).toUpperCase() + category.slice(1)} Properties`
                      : "All Properties"}
          </h1>
          <div className="bg-white rounded-xl p-2 max-w-4xl">
            <SearchForm compact />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Mobile Filter Toggle */}
        <div className="md:hidden flex justify-between items-center mb-4">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
            <Filter className="w-4 h-4" /> Filters
          </Button>
          <div className="flex items-center gap-2">
            <Button variant={showMap ? "default" : "outline"} size="sm" onClick={() => setShowMap(!showMap)} className="gap-2">
              {showMap ? <LayoutGrid className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
              {showMap ? "List" : "Map"}
            </Button>
            <span className="text-sm text-muted-foreground">Sort:</span>
            <select 
              value={sort || ""} 
              onChange={(e) => handleSortChange(e.target.value)}
              className="text-sm bg-transparent border-none font-medium focus:ring-0 cursor-pointer"
            >
              <option value="">Recommended</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating_desc">Top Rated</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
        </div>

        {/* Filters Sidebar */}
        <aside className={`${showFilters ? 'block' : 'hidden'} md:block w-full md:w-64 shrink-0 space-y-8`}>
          <div>
            <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </h3>
            
            <div className="space-y-6">
              {/* Category */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Category</h4>
                <div className="space-y-2">
                  {propertyCategories.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleFilterToggle('category', item.slug)}
                      className="flex w-full items-center gap-3 rounded-lg py-1 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-pressed={category === item.slug}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          category === item.slug ? "border-primary" : "border-muted-foreground"
                        }`}
                      >
                        {category === item.slug && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                      </span>
                      <span className="text-sm">{item.name}</span>
                    </button>
                  ))}
                  {category && (
                    <button 
                      onClick={() => handleFilterToggle('category', category)}
                      className="text-xs text-muted-foreground hover:text-primary mt-2"
                    >
                      Clear category
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full h-px bg-border" />

              {/* Preferences */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Preferences</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={freeCancellation}
                      onChange={(e) => handleFilterToggle('freeCancellation', e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                    <span className="text-sm">Free Cancellation</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={breakfastIncluded}
                      onChange={(e) => handleFilterToggle('breakfastIncluded', e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                    <span className="text-sm">Breakfast Included</span>
                  </label>
                </div>
              </div>

              <div className="w-full h-px bg-border" />
              
              {/* Minimum Rating */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Minimum Rating</h4>
                <div className="flex gap-2">
                  {[3, 4, 4.5].map(r => (
                    <button
                      key={r}
                      onClick={() => handleFilterToggle('minRating', String(r))}
                      className={`px-3 py-1 rounded-md text-sm border transition-colors ${minRating === r ? 'bg-primary text-white border-primary' : 'bg-white text-secondary border-border hover:border-primary'}`}
                    >
                      {r}+
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1">
          <div className="hidden md:flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-secondary">
              {properties ? `${properties.length} properties found` : 'Searching...'}
            </h2>
            <div className="flex items-center gap-3">
              <Button variant={showMap ? "default" : "outline"} size="sm" onClick={() => setShowMap(!showMap)} className="gap-2">
                {showMap ? <LayoutGrid className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
                {showMap ? "Show list" : "Show map"}
              </Button>
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <select 
                value={sort || ""} 
                onChange={(e) => handleSortChange(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">Recommended</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating_desc">Top Rated</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p>Finding the best stays for you...</p>
            </div>
          ) : properties && properties.length > 0 ? (
            showMap ? (
              <SearchResultsMap properties={properties} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {properties.map(property => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-border">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <SearchIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-serif font-bold text-secondary mb-2">No properties found</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Try adjusting your filters, searching for a different area, or changing your dates to see more results.
              </p>
              <Button onClick={() => setLocation('/search')}>Clear all filters</Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
