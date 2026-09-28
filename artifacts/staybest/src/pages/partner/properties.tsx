import { useState } from "react";
import { LocationFields } from "@/components/LocationFields";
import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { PartnerAgreement } from "@/components/partner/PartnerAgreement";
import { 
  useListPartnerProperties, 
  useUpdatePartnerProperty, 
  useGetProperty,
  useCreatePartnerRoom,
  useListSeasonalRates,
  getListSeasonalRatesQueryKey,
  useCreateSeasonalRate,
  useDeleteSeasonalRate,
  useUpdatePartnerRoom,
  useDeletePartnerRoom,
  getListPartnerPropertiesQueryKey,
  getGetPropertyQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useRegisterPartnerProperty
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Edit2, DoorOpen, Plus, Trash2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { useAuth } from "@clerk/react";
import { PropertyImageUploader } from "@/components/PropertyImageUploader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PartnerProperties() {
  const queryClient = useQueryClient();
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  const isPartner = me?.role === 'partner' || me?.role === 'admin';

  const { data: properties, isLoading } = useListPartnerProperties({
    query: { enabled: isPartner, queryKey: getListPartnerPropertiesQueryKey() }
  });

  const updateProp = useUpdatePartnerProperty();
  const registerProp = useRegisterPartnerProperty();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [agreementPropertyId, setAgreementPropertyId] = useState<number | null>(null);
  const [regForm, setRegForm] = useState({
    name: "", category: "prime", country: "", state: "", city: "", area: "", pincode: "", latitude: "", longitude: "", landmark: "", address: "",
    description: "", imageUrl: "", images: "", amenities: "", policies: "", startingPrice: "",
    freeCancellation: false, breakfastIncluded: false, contactPhone: "", contactEmail: ""
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerProp.mutate({
      data: {
        name: regForm.name.trim(),
        category: regForm.category as "prime" | "luxury" | "budget" | "package",
        country: regForm.country.trim(),
        state: regForm.state.trim(),
        city: regForm.city.trim(),
        area: regForm.area.trim(),
        landmark: regForm.landmark.trim() || null,
        address: regForm.address.trim(),
        description: regForm.description.trim(),
        imageUrl: regForm.imageUrl.trim(),
        images: regForm.images.split(",").map((image) => image.trim()).filter(Boolean),
        amenities: regForm.amenities.split(",").map(x => x.trim()).filter(Boolean),
        policies: regForm.policies.split(",").map(x => x.trim()).filter(Boolean),
        startingPrice: Number(regForm.startingPrice),
        freeCancellation: regForm.freeCancellation,
        breakfastIncluded: regForm.breakfastIncluded,
        contactPhone: regForm.contactPhone.trim() || null,
        contactEmail: regForm.contactEmail.trim() || null,
        pincode: regForm.pincode.trim(),
        latitude: regForm.latitude === "" ? null : Number(regForm.latitude),
        longitude: regForm.longitude === "" ? null : Number(regForm.longitude),
      }
    }, {
      onSuccess: (res) => {
        toast.success(res.message);
        setRegisterOpen(false);
        toast.info("Property registered. Open Property Docs / Agreement below to download, sign and upload it.");
        setRegForm({ name: "", category: "prime", country: "", state: "", city: "", area: "", pincode: "", latitude: "", longitude: "", landmark: "", address: "", description: "", imageUrl: "", images: "", amenities: "", policies: "", startingPrice: "", freeCancellation: false, breakfastIncluded: false, contactPhone: "", contactEmail: "" });
        queryClient.invalidateQueries({ queryKey: getListPartnerPropertiesQueryKey() });
      },
      onError: (err: any) => toast.error(err?.response?.data?.message || err.message || "Failed to submit"),
    });
  };
  const createRoom = useCreatePartnerRoom();
  const updateRoom = useUpdatePartnerRoom();
  const deleteRoom = useDeletePartnerRoom();

  const [propDialogOpen, setPropDialogOpen] = useState(false);
  const [editingPropId, setEditingPropId] = useState<number | null>(null);

  // Property Form State
  const [propFormData, setPropFormData] = useState({
    name: "", category: "prime", country: "", state: "", city: "", area: "", pincode: "", latitude: "", longitude: "", address: "", description: "",
    imageUrl: "", images: "", amenities: "", policies: "", 
    checkInTime: "14:00", checkOutTime: "11:00", startingPrice: "", 
    freeCancellation: false, breakfastIncluded: false, featured: false
  });

  // Room Management State
  const [managingRoomsForPropId, setManagingRoomsForPropId] = useState<number | null>(null);
  
  // We fetch full property details to get the rooms list and for editing the property
  const { data: fullPropData, isLoading: fullPropLoading } = useGetProperty(
    (managingRoomsForPropId || editingPropId) as number,
    { query: { enabled: !!(managingRoomsForPropId || editingPropId), queryKey: getGetPropertyQueryKey((managingRoomsForPropId || editingPropId) as number) } }
  );

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [roomFormData, setRoomFormData] = useState({
    name: "", description: "", imageUrl: "", images: "", maxGuests: "2", totalRooms: "5", pricePerNight: "", amenities: "", isAvailable: true
  });
  const [ratesRoom, setRatesRoom] = useState<{ id: number; name: string } | null>(null);
  const [rateForm, setRateForm] = useState({ name: "", startDate: "", endDate: "", pricePerNight: "" });
  const { data: seasonalRates } = useListSeasonalRates(ratesRoom?.id ?? 0, {
    query: { enabled: !!ratesRoom, queryKey: getListSeasonalRatesQueryKey(ratesRoom?.id ?? 0) },
  });
  const createRate = useCreateSeasonalRate();
  const deleteRate = useDeleteSeasonalRate();

  const handleAddRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratesRoom) return;
    createRate.mutate(
      {
        data: {
          roomId: ratesRoom.id,
          name: rateForm.name.trim(),
          startDate: rateForm.startDate,
          endDate: rateForm.endDate,
          pricePerNight: Number(rateForm.pricePerNight),
        },
      },
      {
        onSuccess: () => {
          toast.success("Seasonal rate added");
          setRateForm({ name: "", startDate: "", endDate: "", pricePerNight: "" });
          queryClient.invalidateQueries({ queryKey: getListSeasonalRatesQueryKey(ratesRoom.id) });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to add rate"),
      },
    );
  };

  const handleEditProperty = (propId: number) => {
    setEditingPropId(propId);
    // The query will fetch, then we open dialog and populate. But useGetProperty returns data async.
    // For simplicity, we can rely on a slight delay or watch fullPropData.
    // We'll open the dialog immediately, and let the form show a loader or populate when ready.
    setPropDialogOpen(true);
  };

  // Populate form when full data arrives
  if (editingPropId && fullPropData && propDialogOpen && propFormData.name === "") {
    setPropFormData({
      name: fullPropData.name,
      category: fullPropData.category,
      country: fullPropData.country ?? "",
      state: fullPropData.state ?? "",
      city: fullPropData.city,
      area: fullPropData.area,
      pincode: (fullPropData as any).pincode ?? "",
      latitude: fullPropData.latitude != null ? String(fullPropData.latitude) : "",
      longitude: fullPropData.longitude != null ? String(fullPropData.longitude) : "",
      address: fullPropData.address,
      description: fullPropData.description,
      imageUrl: fullPropData.imageUrl,
      images: fullPropData.images.join(", "),
      amenities: fullPropData.amenities.join(", "),
      policies: fullPropData.policies.join(", "),
      checkInTime: fullPropData.checkInTime,
      checkOutTime: fullPropData.checkOutTime,
      startingPrice: String(fullPropData.startingPrice),
      freeCancellation: fullPropData.freeCancellation,
      breakfastIncluded: fullPropData.breakfastIncluded,
      featured: fullPropData.featured
    });
  }

  const handlePropSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPropId) return;

    const payload = {
      name: propFormData.name,
      category: propFormData.category,
      country: propFormData.country,
      state: propFormData.state,
      city: propFormData.city,
      area: propFormData.area,
      pincode: propFormData.pincode,
      latitude: propFormData.latitude === "" ? null : Number(propFormData.latitude),
      longitude: propFormData.longitude === "" ? null : Number(propFormData.longitude),
      address: propFormData.address,
      description: propFormData.description,
      imageUrl: propFormData.imageUrl,
      images: propFormData.images.split(",").map(s => s.trim()).filter(Boolean),
      amenities: propFormData.amenities.split(",").map(s => s.trim()).filter(Boolean),
      policies: propFormData.policies.split(",").map(s => s.trim()).filter(Boolean),
      checkInTime: propFormData.checkInTime,
      checkOutTime: propFormData.checkOutTime,
      startingPrice: Number(propFormData.startingPrice),
      freeCancellation: propFormData.freeCancellation,
      breakfastIncluded: propFormData.breakfastIncluded,
      featured: propFormData.featured
    };

    updateProp.mutate({ id: editingPropId, data: payload }, {
      onSuccess: () => {
        toast.success("Property updated");
        setPropDialogOpen(false);
        setEditingPropId(null);
        queryClient.invalidateQueries({ queryKey: getListPartnerPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(editingPropId) });
      },
      onError: (err) => toast.error(err.message || "Failed to update")
    });
  };

  const handleRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingRoomsForPropId) return;

    const payload = {
      propertyId: managingRoomsForPropId,
      name: roomFormData.name,
      description: roomFormData.description,
      imageUrl: roomFormData.imageUrl,
      images: roomFormData.images.split(",").map(s => s.trim()).filter(Boolean),
      maxGuests: Number(roomFormData.maxGuests),
      totalRooms: Number(roomFormData.totalRooms),
      pricePerNight: Number(roomFormData.pricePerNight),
      isAvailable: roomFormData.isAvailable,
      amenities: roomFormData.amenities.split(",").map(s => s.trim()).filter(Boolean)
    };

    if (editingRoomId) {
      updateRoom.mutate({ id: editingRoomId, data: payload }, {
        onSuccess: () => {
          toast.success("Room updated");
          setRoomDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(managingRoomsForPropId) });
        },
        onError: (err) => toast.error(err.message || "Failed to update room")
      });
    } else {
      createRoom.mutate({ data: payload }, {
        onSuccess: () => {
          toast.success("Room created");
          setRoomDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(managingRoomsForPropId) });
        },
        onError: (err) => toast.error(err.message || "Failed to create room")
      });
    }
  };

  const handleDeleteRoom = (id: number) => {
    if (confirm("Delete this room type? Cannot be undone.")) {
      deleteRoom.mutate({ id }, {
        onSuccess: () => {
          toast.success("Room deleted");
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(managingRoomsForPropId!) });
        },
        onError: (err) => toast.error(err.message || "Cannot delete room (it may have active bookings).")
      });
    }
  };

  return (
    <PartnerLayout title="My Properties">
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex-1">
          <h4 className="text-blue-800 font-bold mb-1">Register a new hotel or resort</h4>
          <p className="text-blue-700 text-sm">New properties are reviewed by the StayBest team. They appear to customers once approved.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setRegisterOpen(true)}>
          <Plus className="w-4 h-4" /> Register Property
        </Button>
      </div>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register a new property</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRegister} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Property name *</label>
                <Input required value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Category *</label>
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full h-10 border border-input rounded-md px-3 bg-white">
                  <option value="prime">Prime</option>
                  <option value="luxury">Luxury</option>
                  <option value="budget">Budget</option>
                  <option value="package">Package</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Starting price (₹/night) *</label>
                <Input type="number" min="0" required value={regForm.startingPrice} onChange={e => setRegForm({...regForm, startingPrice: e.target.value})} />
              </div>
              <LocationFields
                strictApproved
                value={{ country: regForm.country, state: regForm.state, city: regForm.city, area: regForm.area, pincode: regForm.pincode, latitude: regForm.latitude, longitude: regForm.longitude }}
                onChange={(patch) => setRegForm({ ...regForm, ...patch })}
              />
              <div>
                <label className="text-sm font-medium mb-1 block">Landmark</label>
                <Input value={regForm.landmark} onChange={e => setRegForm({...regForm, landmark: e.target.value})} />
              </div>
              <PropertyImageUploader
                mainValue={regForm.imageUrl}
                galleryValue={regForm.images}
                onMainChange={(imageUrl) => setRegForm((current) => ({ ...current, imageUrl }))}
                onGalleryChange={(images) => setRegForm((current) => ({ ...current, images }))}
                getToken={getToken}
              />
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Full address *</label>
                <Input required value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Description *</label>
                <textarea required rows={3} className="w-full border border-input rounded-md p-3 text-sm" value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Amenities (comma separated)</label>
                <Input placeholder="Pool, WiFi, Spa" value={regForm.amenities} onChange={e => setRegForm({...regForm, amenities: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Policies (comma separated)</label>
                <Input placeholder="No smoking, Pets allowed" value={regForm.policies} onChange={e => setRegForm({...regForm, policies: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Contact phone</label>
                <Input value={regForm.contactPhone} onChange={e => setRegForm({...regForm, contactPhone: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Contact email</label>
                <Input type="email" value={regForm.contactEmail} onChange={e => setRegForm({...regForm, contactEmail: e.target.value})} />
              </div>
              <div className="col-span-2 flex gap-6 items-center border-t pt-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={regForm.freeCancellation} onChange={e => setRegForm({...regForm, freeCancellation: e.target.checked})} /> Free cancellation</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={regForm.breakfastIncluded} onChange={e => setRegForm({...regForm, breakfastIncluded: e.target.checked})} /> Breakfast included</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={registerProp.isPending}>
                {registerProp.isPending ? "Submitting..." : "Submit for approval"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden mb-12">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Property</th>
                <th className="p-4 font-bold">Location</th>
                <th className="p-4 font-bold">Price</th>
                <th className="p-4 font-bold">Rating</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : properties?.map(prop => (
                <tr key={prop.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    <img src={prop.imageUrl} alt={prop.name} className="w-12 h-12 rounded object-cover" />
                    <div>
                      <p className="font-bold text-secondary text-sm">{prop.name}</p>
                      <div className="flex gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 px-1 capitalize">{prop.category}</Badge>
                        {prop.status && prop.status !== 'active' && (
                          <Badge variant="outline" className={`text-[10px] py-0 px-1 capitalize ${
                            prop.status === 'pending' ? 'border-amber-200 text-amber-700 bg-amber-50' : 'border-red-200 text-red-700 bg-red-50'
                          }`}>{prop.status}</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-secondary">{prop.city}, {prop.area}</td>
                  <td className="p-4 text-sm font-bold text-secondary">{formatPrice(prop.startingPrice)}</td>
                  <td className="p-4 text-sm text-muted-foreground">{prop.rating.toFixed(1)} ({prop.reviewCount})</td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="text-xs border-primary/20 text-primary hover:bg-primary/5" onClick={() => {
                        setManagingRoomsForPropId(prop.id);
                      }}>
                        <DoorOpen className="w-4 h-4 mr-1" /> Manage Rooms
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleEditProperty(prop.id)}>
                        <Edit2 className="w-4 h-4 mr-1" /> Edit Info
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setAgreementPropertyId(prop.id)}>
                        Property Docs / Agreement
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Property Edit Dialog */}
      <Dialog open={agreementPropertyId !== null} onOpenChange={open => { if (!open) setAgreementPropertyId(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Sign and upload the property agreement</DialogTitle></DialogHeader>
          {properties?.filter(prop => prop.id === agreementPropertyId).map(prop =>
            <PartnerAgreement key={prop.id} propertyId={prop.id} propertyNumber={prop.propertyNumber} />,
          )}
        </DialogContent>
      </Dialog>

      {/* Property Edit Dialog */}
      <Dialog open={propDialogOpen} onOpenChange={(open) => {
        setPropDialogOpen(open);
        if (!open) { setEditingPropId(null); setPropFormData({...propFormData, name: ""}); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Property Info</DialogTitle>
          </DialogHeader>
          {fullPropLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <form onSubmit={handlePropSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Name</label>
                  <Input required value={propFormData.name} onChange={e => setPropFormData({...propFormData, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Category</label>
                  <select required value={propFormData.category} onChange={e => setPropFormData({...propFormData, category: e.target.value})} className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary">
                    <option value="prime">Prime</option>
                    <option value="luxury">Luxury</option>
                    <option value="budget">Budget</option>
                    <option value="package">Package</option>
                  </select>
                </div>
                <LocationFields
                  strictApproved
                  value={{ country: propFormData.country, state: propFormData.state, city: propFormData.city, area: propFormData.area, pincode: propFormData.pincode, latitude: propFormData.latitude, longitude: propFormData.longitude }}
                  onChange={(patch) => setPropFormData({ ...propFormData, ...patch })}
                />
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Address</label>
                  <Input required value={propFormData.address} onChange={e => setPropFormData({...propFormData, address: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Description</label>
                  <textarea required value={propFormData.description} onChange={e => setPropFormData({...propFormData, description: e.target.value})} className="w-full border border-input rounded-xl p-3 h-24 outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <PropertyImageUploader
                  mainValue={propFormData.imageUrl}
                  galleryValue={propFormData.images}
                  onMainChange={(imageUrl) => setPropFormData({ ...propFormData, imageUrl })}
                  onGalleryChange={(images) => setPropFormData({ ...propFormData, images })}
                  getToken={getToken}
                />
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Amenities (comma separated)</label>
                  <Input required value={propFormData.amenities} onChange={e => setPropFormData({...propFormData, amenities: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Policies (comma separated)</label>
                  <Input required value={propFormData.policies} onChange={e => setPropFormData({...propFormData, policies: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Starting Price (INR)</label>
                  <Input type="number" required value={propFormData.startingPrice} onChange={e => setPropFormData({...propFormData, startingPrice: e.target.value})} />
                </div>
                <div className="flex gap-4 items-end pb-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={propFormData.freeCancellation} onChange={e => setPropFormData({...propFormData, freeCancellation: e.target.checked})} /> Free Cancel</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={propFormData.breakfastIncluded} onChange={e => setPropFormData({...propFormData, breakfastIncluded: e.target.checked})} /> Breakfast</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setPropDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateProp.isPending}>Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Room Management Section */}
      {managingRoomsForPropId && (
        <div className="animate-in slide-in-from-bottom-4 fade-in">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-secondary flex items-center gap-2">
              <DoorOpen className="w-5 h-5 text-primary" /> Rooms for {fullPropData?.name}
            </h3>
            <Button onClick={() => {
              setRoomFormData({ name: "", description: "", imageUrl: "", images: "", maxGuests: "2", totalRooms: "5", pricePerNight: "", amenities: "", isAvailable: true });
              setEditingRoomId(null);
              setRoomDialogOpen(true);
            }}>
              <Plus className="w-4 h-4 mr-2" /> Add Room
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fullPropLoading ? (
              <div className="col-span-3 flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : fullPropData?.rooms.map(room => (
              <div key={room.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="aspect-[4/3] relative">
                  <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover" />
                   {room.images.length > 0 && (
                     <div className="absolute bottom-3 left-3 bg-secondary/85 text-white px-2 py-1 rounded-md text-xs font-bold">
                       +{room.images.length} gallery image{room.images.length === 1 ? "" : "s"}
                     </div>
                   )}
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-secondary">
                    {room.totalRooms} Total
                  </div>
                  {room.isAvailable === false && (
                    <div className="absolute top-3 left-3 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                      Unavailable
                    </div>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-secondary text-lg">{room.name}</h3>
                    <span className="text-primary font-bold">{formatPrice(room.pricePerNight)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Up to {room.maxGuests} guests</p>
                  
                  <div className="flex gap-2 mt-auto pt-4 border-t border-border">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                      setRoomFormData({
                        name: room.name, description: room.description, imageUrl: room.imageUrl, images: room.images.join(", "),
                        maxGuests: String(room.maxGuests), totalRooms: String(room.totalRooms),
                        pricePerNight: String(room.pricePerNight), amenities: room.amenities.join(", "),
                        isAvailable: room.isAvailable !== false
                      });
                      setEditingRoomId(room.id);
                      setRoomDialogOpen(true);
                    }}>
                      <Edit2 className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleDeleteRoom(room.id)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </div>
                  <Button variant="secondary" size="sm" className="w-full mt-2" onClick={() => {
                    setRateForm({ name: "", startDate: "", endDate: "", pricePerNight: "" });
                    setRatesRoom({ id: room.id, name: room.name });
                  }}>
                    Seasonal Pricing
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRoomId ? "Edit Room" : "Add New Room"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleRoomSubmit} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-secondary mb-1 block">Room Name</label>
                    <Input required value={roomFormData.name} onChange={e => setRoomFormData({...roomFormData, name: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-secondary mb-1 block">Description</label>
                    <textarea required value={roomFormData.description} onChange={e => setRoomFormData({...roomFormData, description: e.target.value})} className="w-full border border-input rounded-xl p-3 h-20 outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <PropertyImageUploader
                      mainValue={roomFormData.imageUrl}
                      galleryValue={roomFormData.images}
                      onMainChange={(imageUrl) => setRoomFormData((current) => ({ ...current, imageUrl }))}
                      onGalleryChange={(images) => setRoomFormData((current) => ({ ...current, images }))}
                      getToken={getToken}
                      imageLabel="Room"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary mb-1 block">Price Per Night (INR)</label>
                    <Input type="number" required value={roomFormData.pricePerNight} onChange={e => setRoomFormData({...roomFormData, pricePerNight: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary mb-1 block">Max Guests</label>
                    <Input type="number" required value={roomFormData.maxGuests} onChange={e => setRoomFormData({...roomFormData, maxGuests: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary mb-1 block">Total Rooms</label>
                    <Input type="number" required value={roomFormData.totalRooms} onChange={e => setRoomFormData({...roomFormData, totalRooms: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-secondary mb-1 block">Amenities (comma separated)</label>
                    <Input required value={roomFormData.amenities} onChange={e => setRoomFormData({...roomFormData, amenities: e.target.value})} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2 bg-muted/40 border rounded-xl p-3">
                    <input
                      id="room-available"
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      checked={roomFormData.isAvailable}
                      onChange={e => setRoomFormData({...roomFormData, isAvailable: e.target.checked})}
                    />
                    <label htmlFor="room-available" className="text-sm">
                      <span className="font-bold text-secondary">Available for booking</span>
                      <span className="text-muted-foreground"> — untick to temporarily stop new bookings for this room</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setRoomDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createRoom.isPending || updateRoom.isPending}>Save Room</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={!!ratesRoom} onOpenChange={(o) => !o && setRatesRoom(null)}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Seasonal Pricing — {ratesRoom?.name}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-2">
                During these date ranges, this nightly price replaces the base price automatically at booking.
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(seasonalRates ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between border rounded-xl p-3">
                    <div>
                      <div className="font-bold text-secondary text-sm">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.startDate} → {r.endDate}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary">{formatPrice(r.pricePerNight)}<span className="text-xs text-muted-foreground font-normal">/night</span></span>
                      <Button size="sm" variant="ghost" className="text-red-600" disabled={deleteRate.isPending} onClick={() =>
                        deleteRate.mutate({ id: r.id }, {
                          onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSeasonalRatesQueryKey(ratesRoom!.id) }),
                          onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to delete"),
                        })
                      }>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(seasonalRates ?? []).length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-6">No seasonal rates yet — base price applies year-round.</div>
                )}
              </div>
              <form onSubmit={handleAddRate} className="border-t pt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Season name</label>
                  <Input required placeholder="e.g. Diwali Peak, Summer Season" value={rateForm.name} onChange={e => setRateForm({...rateForm, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">From</label>
                  <Input type="date" required value={rateForm.startDate} onChange={e => setRateForm({...rateForm, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">To</label>
                  <Input type="date" required value={rateForm.endDate} onChange={e => setRateForm({...rateForm, endDate: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Price per night (INR)</label>
                  <Input type="number" required min={1} value={rateForm.pricePerNight} onChange={e => setRateForm({...rateForm, pricePerNight: e.target.value})} />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button type="submit" disabled={createRate.isPending}>{createRate.isPending ? "Adding..." : "Add Seasonal Rate"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      )}

    </PartnerLayout>
  );
}