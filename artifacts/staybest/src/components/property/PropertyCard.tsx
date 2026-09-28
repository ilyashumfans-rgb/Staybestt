import { Link } from "wouter";
import { Star, MapPin, Heart } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useGuestIdentity } from "@/hooks/use-auth";
import { useGetWishlist, useAddToWishlist, useRemoveFromWishlist, getGetWishlistQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface PropertyCardProps {
  property: {
    id: number;
    name: string;
    category: string;
    city: string;
    area: string;
    imageUrl: string;
    rating: number;
    reviewCount: number;
    startingPrice: number;
    amenities: string[];
    freeCancellation: boolean;
  };
  featured?: boolean;
}

export function PropertyCard({ property, featured = false }: PropertyCardProps) {
  const { email, isAuthenticated } = useGuestIdentity();
  const queryClient = useQueryClient();
  
  const { data: wishlist } = useGetWishlist(
    { email }, 
    { query: { enabled: !!email, queryKey: getGetWishlistQueryKey({ email }) } }
  );
  
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  
  const isWishlisted = wishlist?.some(p => p.id === property.id);

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      // Could show a toast to login
      return;
    }
    
    if (isWishlisted) {
      removeFromWishlist.mutate({ params: { propertyId: property.id, email } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email }) });
        }
      });
    } else {
      addToWishlist.mutate({ data: { propertyId: property.id, email } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email }) });
        }
      });
    }
  };

  const incomingParams = new URLSearchParams(window.location.search);
  const guestParams = new URLSearchParams();
  ["checkIn", "checkOut", "adults", "children", "guests"].forEach((key) => {
    const value = incomingParams.get(key);
    if (value) guestParams.set(key, value);
  });
  const propertyHref = `/property/${property.id}${guestParams.size ? `?${guestParams.toString()}` : ""}`;

  return (
    <Link href={propertyHref} className="group block h-full">
      <div className="relative rounded-2xl overflow-hidden bg-card border border-card-border shadow-sm group-hover:shadow-xl transition-all duration-500 h-full flex flex-col">
        
        {/* Image Container */}
        <div className={`relative overflow-hidden ${featured ? 'aspect-[4/3]' : 'aspect-[4/3]'}`}>
          <div className="absolute inset-0 bg-secondary/10 group-hover:bg-transparent transition-colors z-10" />
          <img 
            src={property.imageUrl} 
            alt={property.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          
          {/* Top Badges */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-20">
            <div className="flex flex-col gap-2">
              <Badge variant="white" className="capitalize font-serif">
                {property.category}
              </Badge>
              {property.freeCancellation && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 border-none shadow-md">
                  Free Cancellation
                </Badge>
              )}
            </div>
            
            <button 
              onClick={handleWishlistToggle}
              className={`w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${isWishlisted ? 'text-primary' : 'text-secondary/50'}`}
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-serif text-lg font-bold text-secondary group-hover:text-primary transition-colors line-clamp-1">
                {property.name}
              </h3>
              <div className="flex items-center text-muted-foreground text-sm mt-1">
                <MapPin className="w-3.5 h-3.5 mr-1" />
                <span className="line-clamp-1">{property.area}, {property.city}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end shrink-0">
              <div className="flex items-center bg-secondary text-white px-1.5 py-0.5 rounded text-sm font-bold">
                <Star className="w-3.5 h-3.5 fill-current mr-1 text-primary" />
                {property.rating.toFixed(1)}
              </div>
              <span className="text-xs text-muted-foreground mt-1">({property.reviewCount})</span>
            </div>
          </div>

          <div className="mt-auto pt-4 flex items-end justify-between border-t border-border/50">
            <div className="flex flex-wrap gap-1">
              {property.amenities.slice(0, 2).map(amenity => (
                <span key={amenity} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  {amenity}
                </span>
              ))}
              {property.amenities.length > 2 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  +{property.amenities.length - 2}
                </span>
              )}
            </div>
            
            <div className="text-right shrink-0 ml-2">
              <p className="text-xs text-muted-foreground mb-0.5">Starting from</p>
              <p className="text-lg font-bold text-secondary">
                {formatPrice(property.startingPrice)}
                <span className="text-xs font-normal text-muted-foreground ml-1">/night</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
