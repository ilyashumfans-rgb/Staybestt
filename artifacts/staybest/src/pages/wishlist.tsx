import { Layout } from "@/components/layout/Layout";
import { useGetWishlist, getGetWishlistQueryKey } from "@workspace/api-client-react";
import { useGuestIdentity } from "@/hooks/use-auth";
import { PropertyCard } from "@/components/property/PropertyCard";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Wishlist() {
  const { email, isAuthenticated } = useGuestIdentity();

  const { data: properties, isLoading } = useGetWishlist(
    { email },
    { query: { enabled: !!email, queryKey: getGetWishlistQueryKey({ email }) } }
  );

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center bg-muted/30 text-center px-4">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6">
            <Heart className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-secondary mb-4">Your Wishlist</h1>
          <p className="text-muted-foreground max-w-md mb-8">Sign in by checking your bookings to see and manage your saved properties.</p>
          <Button asChild size="lg"><Link href="/my-bookings">Sign In</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-secondary pt-24 pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-3">
            <Heart className="w-8 h-8 fill-primary text-primary" /> Saved Properties
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 min-h-[50vh]">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : properties && properties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {properties.map(property => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border mx-auto mb-6">
              <Heart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-secondary mb-3">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-8">
              Keep track of your favorite resorts and hotels by clicking the heart icon on any property.
            </p>
            <Button asChild size="lg"><Link href="/search">Explore Stays</Link></Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
