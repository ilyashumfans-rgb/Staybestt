import { useGetHomeData, useListDestinations } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { SearchForm } from "@/components/search/SearchForm";
import { PropertyCard } from "@/components/property/PropertyCard";
import { Link } from "wouter";
import { ArrowRight, TicketPercent, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import hero3dHome from "@/assets/hero-3d-home.png";

export default function Home() {
  const { data: homeData, isLoading } = useGetHomeData();
  const { data: destinations } = useListDestinations();

  return (
    <Layout>
      {/* Hero Section — light, with 3D home visual */}
      <section className="relative min-h-[100dvh] flex flex-col justify-center pt-28 pb-24 overflow-hidden bg-gradient-to-b from-[#fdf8f2] via-white to-[#f6f8fc]">
        {/* Soft decorative glows */}
        <div className="pointer-events-none absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 w-[520px] h-[520px] rounded-full bg-secondary/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(11,26,48,0.08) 1px, transparent 0)", backgroundSize: "28px 28px" }} />

        <div className="container mx-auto px-4 md:px-6 relative z-10 flex-1 flex flex-col justify-center">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center mb-12">
            {/* Copy */}
            <div className="max-w-2xl">
              <BrandLogo
                variant="horizontal"
                alt="StayBest — Choose your own Space"
                className="h-10 md:h-12 mb-8 animate-slide-up-fade opacity-0"
              />
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-secondary font-bold mb-6 tracking-tight leading-[1.08] animate-slide-up-fade delay-100 opacity-0">
                Find Your <span className="text-primary italic">Perfect</span> Stay, Every&nbsp;Time.
              </h1>
              <p className="text-lg md:text-xl text-secondary/70 font-light tracking-wide animate-slide-up-fade delay-200 opacity-0 leading-relaxed">
                Discover handpicked luxury resorts, stunning hotels, and perfect holiday packages for your next unforgettable getaway.
              </p>
            </div>

            {/* 3D home visual */}
            <div className="relative hidden lg:flex items-center justify-center animate-slide-up-fade delay-300 opacity-0">
              <div className="absolute w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-primary/20 via-orange-200/40 to-secondary/10 blur-2xl" />
              <img
                src={hero3dHome}
                alt="3D luxury resort villa"
                className="relative w-full max-w-[560px] drop-shadow-[0_40px_60px_rgba(11,26,48,0.25)] animate-float"
              />
              {/* Floating shadow */}
              <div className="absolute bottom-6 w-2/3 h-8 bg-secondary/15 blur-2xl rounded-full" />
              {/* Floating rating chip */}
              <div className="absolute top-8 right-2 flex items-center gap-2 bg-white/80 backdrop-blur-md border border-secondary/10 px-4 py-2 rounded-full shadow-xl">
                <Star className="w-4 h-4 fill-primary text-primary" />
                <span className="text-sm font-bold tracking-wide text-secondary">4.9/5 Average Rating</span>
              </div>
              {/* Floating stays chip */}
              <div className="absolute bottom-16 left-0 bg-white/80 backdrop-blur-md border border-secondary/10 px-4 py-2 rounded-full shadow-xl">
                <span className="text-sm font-bold tracking-wide text-secondary">8+ Handpicked Stays</span>
              </div>
            </div>
          </div>

          <div className="animate-slide-up-fade delay-300 opacity-0 w-full max-w-6xl mx-auto">
            <SearchForm />
          </div>
        </div>
      </section>

      {/* Banners */}

      {/* Offers Section */}
      {homeData?.offers && homeData.offers.length > 0 && (
        <section className="py-12 bg-white border-b">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex gap-6 overflow-x-auto pb-4 snap-x hide-scrollbar">
              {homeData.offers.map((offer) => (
                <div key={offer.id} className="min-w-[300px] shrink-0 bg-accent rounded-2xl p-6 flex items-start gap-4 snap-start border border-accent-border">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-primary shrink-0 shadow-sm">
                    <TicketPercent className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-secondary mb-1">{offer.title}</h4>
                    <p className="text-sm text-secondary/80 mb-3">{offer.description}</p>
                    {offer.couponCode && (
                      <div className="inline-block bg-white border border-dashed border-primary px-3 py-1 text-sm font-bold text-primary rounded">
                        {offer.couponCode}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recommended For You — personalized from saved AI preferences */}
      {homeData?.recommended && homeData.recommended.length > 0 && (
        <section className="py-20 bg-white border-b">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex items-end justify-between mb-10">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="text-sm font-bold uppercase tracking-wider text-primary">Picked by your preferences</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-secondary mb-4">Recommended for You</h2>
                <p className="text-muted-foreground text-lg">Stays matched to your travel style, favorite categories, and budget.</p>
              </div>
              <Button asChild variant="outline" className="hidden md:flex items-center text-primary font-semibold hover:gap-2 transition-all">
                <Link href="/profile?section=ai">
                  Update preferences <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {homeData.recommended.map(property => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Properties */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-end justify-between mb-10">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-secondary mb-4">Handpicked For You</h2>
              <p className="text-muted-foreground text-lg">Exceptional stays curated for the ultimate experience.</p>
            </div>
            <Button asChild variant="outline" className="hidden md:flex items-center text-primary font-semibold hover:gap-2 transition-all">
              <Link href="/search?category=prime">
                View all <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {homeData?.featured.map(property => (
                <PropertyCard key={property.id} property={property} featured />
              ))}
            </div>
          )}
          
          <div className="mt-8 text-center md:hidden">
            <Button asChild variant="outline" className="w-full">
              <Link href="/search?category=prime">View all handpicked stays</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Top Destinations */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-secondary mb-4">Trending Destinations</h2>
            <p className="text-muted-foreground text-lg">Where everyone is heading this season.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {isLoading ? (
              [1, 2, 3, 4].map(i => <div key={i} className="rounded-2xl bg-muted h-64 animate-pulse" />)
            ) : (
              destinations?.length ? destinations.map((destination) => (
                <Link
                  key={destination.id}
                  href={`/search?country=${encodeURIComponent(destination.country)}${destination.state ? `&state=${encodeURIComponent(destination.state)}` : ""}${destination.city ? `&city=${encodeURIComponent(destination.city)}` : ""}`}
                  className="group block relative overflow-hidden rounded-2xl aspect-[3/4] md:aspect-square"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-secondary/90 via-secondary/20 to-transparent z-10" />
                  <img src={destination.imageUrl} alt={destination.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                    <p className="text-white/75 text-xs font-bold uppercase tracking-widest">{destination.city || destination.state || destination.country}</p>
                    <h3 className="text-2xl font-serif font-bold text-white mb-1">{destination.title}</h3>
                    <p className="text-white/80 text-sm font-medium">{destination.propertyCount} properties</p>
                  </div>
                </Link>
              )) : homeData?.cities.map((cityStat) => (
                <Link key={cityStat.city} href={`/search?city=${cityStat.city}`} className="group block relative overflow-hidden rounded-2xl aspect-[3/4] md:aspect-square">
                  <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-secondary/20 to-transparent z-10" />
                  <img 
                    src={cityStat.imageUrl || `https://source.unsplash.com/800x800/?city,${cityStat.city}`} 
                    alt={cityStat.city} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1596422846543-75c6ff1978b4?auto=format&fit=crop&q=80&w=800`;
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                    <h3 className="text-2xl font-serif font-bold text-white mb-1">{cityStat.city}</h3>
                    <p className="text-white/80 text-sm font-medium">{cityStat.propertyCount} properties</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Top Rated */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-secondary mb-4">Guest Favorites</h2>
            <p className="text-muted-foreground text-lg">Properties loved by travelers like you.</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => <CardSkeleton key={i} small />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {homeData?.topRated.map(property => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

function CardSkeleton({ small = false }: { small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className={`bg-muted animate-pulse ${small ? 'aspect-[4/3]' : 'aspect-[4/3]'}`} />
      <div className="p-5">
        <div className="h-6 bg-muted animate-pulse rounded w-3/4 mb-3" />
        <div className="h-4 bg-muted animate-pulse rounded w-1/2 mb-6" />
        <div className="flex justify-between items-end border-t border-border pt-4">
          <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
          <div className="h-6 bg-muted animate-pulse rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}