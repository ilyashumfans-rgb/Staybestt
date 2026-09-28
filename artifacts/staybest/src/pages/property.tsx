import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { 
  useGetProperty, 
  useGetPropertyReviews, 
  useGetAvailability, getGetAvailabilityQueryKey, 
  useCreateReview,
  useAddToWishlist,
  useRemoveFromWishlist,
  useGetWishlist,
  getGetPropertyQueryKey,
  getGetPropertyReviewsQueryKey,
  getGetWishlistQueryKey
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  MapPin, Star, Heart, Check, Clock, Info, 
  ChevronRight, Calendar, Users, Loader2, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { useGuestIdentity } from "@/hooks/use-auth";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { PropertyMap } from "@/components/PropertyMap";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type PhotoGallery = {
  title: string;
  photos: string[];
  index: number;
};

function roomPhotos(room: { imageUrl: string; images?: string[] }) {
  return [...new Set([room.imageUrl, ...(room.images ?? [])].filter(Boolean))];
}

export default function PropertyDetail() {
  const params = useParams();
  const propertyId = Number(params.id);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { email, isAuthenticated } = useGuestIdentity();

  // Booking search state
  const [checkIn, setCheckIn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));
  const initialGuestParams = new URLSearchParams(window.location.search);
  const [adults, setAdults] = useState(
    () => Number(initialGuestParams.get("adults")) || Number(initialGuestParams.get("guests")) || 2,
  );
  const [children, setChildren] = useState(
    () => Math.max(0, Number(initialGuestParams.get("children")) || 0),
  );
  const guests = adults + children;
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [gallery, setGallery] = useState<PhotoGallery | null>(null);

  const openGallery = (title: string, photos: string[], index: number) => {
    if (photos.length > 0) setGallery({ title, photos, index });
  };

  const changePhoto = (direction: number) => {
    setGallery(current => current && ({
      ...current,
      index: (current.index + direction + current.photos.length) % current.photos.length,
    }));
  };

  const { data: property, isLoading } = useGetProperty(propertyId, {
    query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) }
  });

  const { data: reviews } = useGetPropertyReviews(propertyId, {
    query: { enabled: !!propertyId, queryKey: getGetPropertyReviewsQueryKey(propertyId) }
  });

  const { data: wishlist } = useGetWishlist(
    { email }, 
    { query: { enabled: !!email, queryKey: getGetWishlistQueryKey({ email }) } }
  );

  const { data: availability } = useGetAvailability(
    { propertyId, checkIn, checkOut, guests, adults, children },
    { query: { enabled: isCheckingAvailability && !!propertyId && !!checkIn && !!checkOut, queryKey: getGetAvailabilityQueryKey({ propertyId, checkIn, checkOut, guests, adults, children }) } }
  );

  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const createReview = useCreateReview();

  const isWishlisted = wishlist?.some(p => p.id === propertyId);

  const handleWishlistToggle = () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to save properties.");
      return;
    }
    
    if (isWishlisted) {
      removeFromWishlist.mutate({ params: { propertyId, email } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email }) });
          toast.success("Removed from wishlist");
        }
      });
    } else {
      addToWishlist.mutate({ data: { propertyId, email } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email }) });
          toast.success("Added to wishlist");
        }
      });
    }
  };

  const handleCheckAvailability = (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error("Check-out date must be after check-in date");
      return;
    }
    setIsCheckingAvailability(true);
    // Scroll to rooms section
    document.getElementById("rooms")?.scrollIntoView({ behavior: 'smooth' });
  };

  const [reviewName, setReviewName] = useState(email || "");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName || !reviewText) return;

    createReview.mutate({
      id: propertyId,
      data: { guestName: reviewName, rating: reviewRating, comment: reviewText }
    }, {
      onSuccess: () => {
        toast.success("Review submitted successfully");
        setReviewText("");
        queryClient.invalidateQueries({ queryKey: getGetPropertyReviewsQueryKey(propertyId) });
      }
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Property not found</h1>
          <Button asChild className="mt-4"><Link href="/search">Back to search</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Gallery Header */}
      <div className="bg-secondary pt-24 pb-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="white" className="capitalize">{property.category}</Badge>
                <div className="flex items-center text-white/90 text-sm">
                  <Star className="w-4 h-4 text-primary fill-current mr-1" />
                  <span className="font-bold mr-1">{property.rating.toFixed(1)}</span>
                  <span>({property.reviewCount} reviews)</span>
                </div>
              </div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold text-white mb-2">{property.name}</h1>
              <p className="text-white/80 flex items-center text-sm md:text-base">
                <MapPin className="w-4 h-4 mr-1 text-primary" />
                {property.address}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                className={`gap-2 border-white/20 bg-white/10 hover:bg-white/20 text-white ${isWishlisted ? 'text-primary border-primary/50' : ''}`}
                onClick={handleWishlistToggle}
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} /> 
                {isWishlisted ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Grid */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-2xl overflow-hidden h-[400px] md:h-[500px]">
          {property.images[0] && (
            <button
              type="button"
              onClick={() => openGallery(property.name, property.images, 0)}
              aria-label={`View photos of ${property.name}, starting at photo 1`}
              data-testid="button-property-photo-0"
              className="md:col-span-2 md:row-span-2 relative overflow-hidden cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-primary"
            >
              <img src={property.images[0]} alt={property.name} className="w-full h-full object-cover" />
              {property.images.length > 1 && <span className="absolute bottom-4 right-4 rounded-lg bg-black/75 px-3 py-2 text-sm font-medium text-white md:hidden">View all {property.images.length} photos</span>}
            </button>
          )}
          {property.images.slice(1, 5).map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => openGallery(property.name, property.images, i + 1)}
              aria-label={`View photos of ${property.name}, starting at photo ${i + 2}`}
              data-testid={`button-property-photo-${i + 1}`}
              className="hidden md:block relative overflow-hidden cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-primary"
            >
              <img src={img} alt={`${property.name} ${i+1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={gallery !== null} onOpenChange={open => { if (!open) setGallery(null); }}>
        <DialogContent
          aria-describedby={undefined}
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              changePhoto(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          className="flex h-[min(90dvh,900px)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-3 overflow-hidden rounded-xl border-0 bg-zinc-950 p-3 text-white sm:p-6 [&>button]:text-white"
        >
          {gallery && (
            <>
              <div className="pr-10">
                <DialogTitle className="truncate text-base sm:text-lg">{gallery.title}</DialogTitle>
                <p className="mt-1 text-sm text-white/70" aria-live="polite" data-testid="text-gallery-counter">
                  Photo {gallery.index + 1} of {gallery.photos.length}
                </p>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <img
                  src={gallery.photos[gallery.index]}
                  alt={`${gallery.title}, photo ${gallery.index + 1} of ${gallery.photos.length}`}
                  className="max-h-full max-w-full object-contain"
                  data-testid="img-gallery-selected"
                />
              </div>
              {gallery.photos.length > 1 && (
                <div className="flex shrink-0 items-center justify-between gap-4">
                  <Button type="button" variant="outline" className="gap-2 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white" onClick={() => changePhoto(-1)} aria-label="Previous photo" data-testid="button-gallery-previous">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button type="button" variant="outline" className="gap-2 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white" onClick={() => changePhoto(1)} aria-label="Next photo" data-testid="button-gallery-next">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* Description */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-secondary mb-4">About this property</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </section>

            {/* Amenities */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-secondary mb-4">Amenities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {property.amenities.map(amenity => (
                  <div key={amenity} className="flex items-center gap-2 text-secondary">
                    <Check className="w-5 h-5 text-primary" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Policies */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-secondary mb-4">Policies</h2>
              <div className="bg-muted/50 rounded-2xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="flex gap-3">
                    <Clock className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <h4 className="font-bold text-secondary text-sm">Check-in</h4>
                      <p className="text-muted-foreground text-sm">{property.checkInTime}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Clock className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <h4 className="font-bold text-secondary text-sm">Check-out</h4>
                      <p className="text-muted-foreground text-sm">{property.checkOutTime}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {property.policies.map((policy, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm text-secondary">{policy}</p>
                    </div>
                  ))}
                  {property.freeCancellation && (
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-secondary font-medium">Free cancellation up to 48 hours before check-in.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Location Map */}
            {property.latitude != null && property.longitude != null && (
              <PropertyMap
                latitude={property.latitude}
                longitude={property.longitude}
                name={property.name}
              />
            )}

            {/* Rooms List */}
            <section id="rooms" className="scroll-mt-24">
              <h2 className="text-2xl font-serif font-bold text-secondary mb-6">Available Rooms</h2>
              
              {!isCheckingAvailability ? (
                <div className="space-y-6">
                  {property.rooms.map(room => (
                    <div key={room.id} className="border border-border rounded-2xl overflow-hidden flex flex-col md:flex-row bg-white">
                       <button type="button" onClick={() => openGallery(room.name, roomPhotos(room), 0)} aria-label={`View photos of ${room.name}`} data-testid={`button-room-photo-${room.id}`} className="w-full md:w-1/3 aspect-[4/3] md:aspect-auto relative overflow-hidden cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-primary">
                        <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover" />
                       </button>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-bold text-secondary">{room.name}</h3>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Users className="w-4 h-4 mr-1" /> Up to {room.maxGuests} guests
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{room.description}</p>
                        
                        <div className="flex flex-wrap gap-2 mb-6">
                          {room.amenities.slice(0,3).map(a => (
                            <span key={a} className="text-xs bg-muted px-2 py-1 rounded">{a}</span>
                          ))}
                        </div>
                        
                        <div className="mt-auto flex items-end justify-between border-t pt-4">
                          <div>
                            <p className="text-2xl font-bold text-secondary">{formatPrice(room.pricePerNight)}</p>
                            <p className="text-xs text-muted-foreground">per night</p>
                          </div>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              document.getElementById("availability-form")?.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            Check Dates
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {availability && availability.length > 0 ? (
                    availability.map((avail) => (
                      <div key={avail.room.id} className="border border-primary/20 rounded-2xl overflow-hidden flex flex-col md:flex-row bg-white shadow-sm ring-1 ring-primary/5">
                         <button type="button" onClick={() => openGallery(avail.room.name, roomPhotos(avail.room), 0)} aria-label={`View photos of ${avail.room.name}`} data-testid={`button-available-room-photo-${avail.room.id}`} className="w-full md:w-1/3 aspect-[4/3] md:aspect-auto relative overflow-hidden cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-primary">
                          <img src={avail.room.imageUrl} alt={avail.room.name} className="w-full h-full object-cover" />
                         </button>
                        <div className="p-6 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-bold text-secondary">{avail.room.name}</h3>
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              {avail.availableRooms} left
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{avail.room.description}</p>
                          
                          <div className="mt-auto flex items-end justify-between border-t pt-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Total for {avail.nights} nights</p>
                              <p className="text-2xl font-bold text-secondary">{formatPrice(avail.totalPrice)}</p>
                            </div>
                            <Button 
                              onClick={() => {
                                 const url = `/booking/${property.id}/${avail.room.id}?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=${children}&guests=${guests}`;
                                setLocation(url);
                              }}
                            >
                              Book Now
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : availability ? (
                    <div className="text-center py-10 bg-muted/30 rounded-2xl border">
                      <p className="text-lg font-medium text-secondary">No rooms available for these dates.</p>
                      <p className="text-muted-foreground">Try selecting different dates.</p>
                    </div>
                  ) : (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  )}
                </div>
              )}
            </section>

            {/* Reviews */}
            <section className="pt-10 border-t">
              <h2 className="text-2xl font-serif font-bold text-secondary mb-6 flex items-center gap-2">
                <Star className="w-6 h-6 text-primary fill-current" />
                {property.rating.toFixed(1)} · {property.reviewCount} Reviews
              </h2>
              
              <div className="space-y-6 mb-10">
                {reviews?.slice(0, 5).map(review => (
                  <div key={review.id} className="border-b pb-6">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {review.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-secondary">{review.guestName}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</span>
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'text-primary fill-current' : 'text-border'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-secondary/80 text-sm leading-relaxed">{review.comment}</p>
                  </div>
                ))}
              </div>

              {/* Add Review */}
              <div className="bg-muted/30 p-6 rounded-2xl border">
                <h3 className="font-bold text-secondary mb-4">Leave a review</h3>
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1 block">Your Name</label>
                      <Input value={reviewName} onChange={e => setReviewName(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-secondary mb-1 block">Rating</label>
                      <select 
                        value={reviewRating} 
                        onChange={e => setReviewRating(Number(e.target.value))}
                        className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} Stars</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary mb-1 block">Your Experience</label>
                    <textarea 
                      value={reviewText}
                      onChange={e => setReviewText(e.target.value)}
                      required
                      rows={4}
                      className="w-full rounded-xl border border-input p-3 outline-none focus:ring-2 focus:ring-primary resize-none"
                      placeholder="Tell us about your stay..."
                    />
                  </div>
                  <Button type="submit" disabled={createReview.isPending}>
                    {createReview.isPending ? "Submitting..." : "Submit Review"}
                  </Button>
                </form>
              </div>
            </section>
          </div>

          {/* Sidebar Booking Form */}
          <div className="lg:col-span-1">
            <div id="availability-form" className="sticky top-32 bg-white rounded-2xl shadow-xl border border-border p-6">
              <div className="mb-6">
                <span className="text-2xl font-bold text-secondary">{formatPrice(property.startingPrice)}</span>
                <span className="text-muted-foreground text-sm"> / night</span>
              </div>

              <form onSubmit={handleCheckAvailability} className="space-y-4">
                <div className="grid grid-cols-2 gap-2 border rounded-xl overflow-hidden bg-muted/30">
                  <div className="p-3 border-r">
                    <label className="text-xs font-bold text-secondary uppercase block mb-1">Check-in</label>
                    <input 
                      type="date" 
                      required
                      value={checkIn}
                      onChange={e => setCheckIn(e.target.value)}
                      className="w-full bg-transparent border-none p-0 text-sm outline-none focus:ring-0" 
                    />
                  </div>
                  <div className="p-3">
                    <label className="text-xs font-bold text-secondary uppercase block mb-1">Check-out</label>
                    <input 
                      type="date" 
                      required
                      value={checkOut}
                      onChange={e => setCheckOut(e.target.value)}
                      className="w-full bg-transparent border-none p-0 text-sm outline-none focus:ring-0" 
                    />
                  </div>
                </div>
                
                <div className="border rounded-xl p-3 bg-muted/30">
                  <label className="text-xs font-bold text-secondary uppercase block mb-2">Guests</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={adults}
                      onChange={e => setAdults(Number(e.target.value))}
                      aria-label="Adults"
                      className="w-full bg-white border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    >
                      {Array.from({ length: 10 }, (_, index) => index + 1).map(count => (
                        <option key={count} value={count}>{count} Adult{count === 1 ? "" : "s"}</option>
                      ))}
                    </select>
                    <select
                      value={children}
                      onChange={e => setChildren(Number(e.target.value))}
                      aria-label="Children"
                      className="w-full bg-white border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    >
                      {Array.from({ length: 7 }, (_, index) => index).map(count => (
                        <option key={count} value={count}>{count} Child{count === 1 ? "" : "ren"}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full text-base h-12 mt-4">
                  Check Availability
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t space-y-4">
                {property.freeCancellation && (
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-600 shrink-0" />
                    <span className="text-sm font-medium">Free cancellation available</span>
                  </div>
                )}
                {property.breakfastIncluded && (
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm font-medium">Breakfast included</span>
                  </div>
                )}
                <div className="flex justify-center pt-2">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" className="h-5 opacity-50 grayscale" alt="Payments" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
