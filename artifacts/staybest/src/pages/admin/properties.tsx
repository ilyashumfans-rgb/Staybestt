import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { 
  useListAdminProperties, 
  useCreateProperty, 
  useUpdateProperty, 
  useDeleteProperty,
  useSetPropertyStatus,
  useListAdminUsers,
  getListAdminPropertiesQueryKey,
  getListAdminUsersQueryKey,
  useListPropertyCategories,
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Edit2, Trash2, DoorOpen, CheckCircle2, XCircle, PauseCircle, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";
import { getProperty } from "@workspace/api-client-react";
import { LocationFields } from "@/components/LocationFields";
import { PropertyImageUploader } from "@/components/PropertyImageUploader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatPropertyReference(propertyNumber: number) {
  return `PM-${String(propertyNumber).padStart(4, "0")}`;
}

export default function AdminProperties() {
  const queryClient = useQueryClient();
  const { data: properties, isLoading } = useListAdminProperties({ query: { queryKey: getListAdminPropertiesQueryKey() } });
  const { data: propertyCategories } = useListPropertyCategories();
  const setStatus = useSetPropertyStatus();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const filterOptions = useMemo(() => {
    const rows = properties ?? [];
    const uniqueValues = (values: (string | null | undefined)[]) =>
      Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
        .sort((a, b) => a.localeCompare(b));

    return {
      statuses: uniqueValues(rows.map((property) => property.status ?? "active")),
      categories: uniqueValues(rows.map((property) => property.category)),
      states: uniqueValues(rows.map((property) => property.state)),
      cities: uniqueValues(rows.map((property) => property.city)),
    };
  }, [properties]);

  const categoryNames = useMemo(
    () => new Map((propertyCategories ?? []).map((category) => [category.slug, category.name])),
    [propertyCategories],
  );

  const filteredProperties = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const compactSearch = normalizedSearch.replace(/[^a-z0-9]/g, "");

    return (properties ?? []).filter((property) => {
      const propertyReference = formatPropertyReference(property.propertyNumber).toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        property.name.toLowerCase().includes(normalizedSearch) ||
        propertyReference.includes(normalizedSearch) ||
        propertyReference.replace(/[^a-z0-9]/g, "").includes(compactSearch);
      const matchesStatus = statusFilter === "all" || (property.status ?? "active") === statusFilter;
      const matchesCategory = categoryFilter === "all" || property.category === categoryFilter;
      const matchesState = stateFilter === "all" || property.state === stateFilter;
      const matchesCity = cityFilter === "all" || property.city === cityFilter;

      return matchesSearch && matchesStatus && matchesCategory && matchesState && matchesCity;
    });
  }, [categoryFilter, cityFilter, properties, searchTerm, stateFilter, statusFilter]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    stateFilter !== "all" ||
    cityFilter !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setStateFilter("all");
    setCityFilter("all");
  };

  const handleStatus = (id: number, status: "approved" | "active" | "suspended" | "rejected") => {
    const labels = { approved: "Approve", active: "Activate", suspended: "Suspend", rejected: "Reject" };
    if (!confirm(`${labels[status]} this property?`)) return;
    setStatus.mutate({ id, data: { status } }, {
      onSuccess: (res) => {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: getListAdminPropertiesQueryKey() });
      },
      onError: (err: any) => toast.error(err?.response?.data?.message || err.message || "Failed"),
    });
  };
  const { data: users } = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey() } });

  const partners = users?.filter(u => u.role === 'partner') || [];

  const createProp = useCreateProperty();
  const updateProp = useUpdateProperty();
  const deleteProp = useDeleteProperty();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPropertyNumber, setEditingPropertyNumber] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "", category: "stay", country: "", state: "", city: "", area: "", pincode: "", latitude: "", longitude: "", address: "", description: "",
    imageUrl: "", images: "", amenities: "", policies: "", 
    checkInTime: "14:00", checkOutTime: "11:00", startingPrice: "", 
    freeCancellation: false, breakfastIncluded: false, featured: false, ownerId: ""
  });

  useEffect(() => {
    if (
      !editingId &&
      propertyCategories?.length &&
      !propertyCategories.some((category) => category.slug === formData.category)
    ) {
      setFormData((current) => ({ ...current, category: propertyCategories[0]!.slug }));
    }
  }, [editingId, formData.category, propertyCategories]);

  const resetForm = () => {
    setFormData({
      name: "", category: "stay", country: "", state: "", city: "", area: "", pincode: "", latitude: "", longitude: "", address: "", description: "",
      imageUrl: "", images: "", amenities: "", policies: "", 
      checkInTime: "14:00", checkOutTime: "11:00", startingPrice: "", 
      freeCancellation: false, breakfastIncluded: false, featured: false, ownerId: ""
    });
    setEditingId(null);
    setEditingPropertyNumber(null);
  };

  const handleEdit = async (prop: any) => {
    // Fetch full detail so edits never overwrite address/policies/images with placeholders
    try {
      const detail = await getProperty(prop.id);
      setFormData({
        name: detail.name,
        category: detail.category,
        country: detail.country ?? "",
        state: detail.state ?? "",
        city: detail.city,
        area: detail.area,
        pincode: (detail as any).pincode ?? "",
        latitude: detail.latitude != null ? String(detail.latitude) : "",
        longitude: detail.longitude != null ? String(detail.longitude) : "",
        address: detail.address,
        description: detail.description,
        imageUrl: detail.imageUrl,
        images: detail.images.join(", "),
        amenities: detail.amenities.join(", "),
        policies: detail.policies.join(", "),
        checkInTime: detail.checkInTime,
        checkOutTime: detail.checkOutTime,
        startingPrice: String(detail.startingPrice),
        freeCancellation: detail.freeCancellation,
        breakfastIncluded: detail.breakfastIncluded,
        featured: detail.featured,
        ownerId: (detail as any).ownerId ?? ""
      });
      setEditingId(prop.id);
      setEditingPropertyNumber(detail.propertyNumber);
      setIsDialogOpen(true);
    } catch {
      toast.error("Failed to load property details");
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this property? This will delete all rooms, reviews, and bookings associated with it.")) {
      deleteProp.mutate({ id }, {
        onSuccess: () => {
          toast.success("Property deleted");
          queryClient.invalidateQueries({ queryKey: getListAdminPropertiesQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to delete property")
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      category: formData.category,
      country: formData.country,
      state: formData.state,
      city: formData.city,
      area: formData.area,
      pincode: formData.pincode,
      latitude: formData.latitude === "" ? null : Number(formData.latitude),
      longitude: formData.longitude === "" ? null : Number(formData.longitude),
      address: formData.address,
      description: formData.description,
      imageUrl: formData.imageUrl,
      images: formData.images.split(",").map(s => s.trim()).filter(Boolean),
      amenities: formData.amenities.split(",").map(s => s.trim()).filter(Boolean),
      policies: formData.policies.split(",").map(s => s.trim()).filter(Boolean),
      checkInTime: formData.checkInTime,
      checkOutTime: formData.checkOutTime,
      startingPrice: Number(formData.startingPrice),
      freeCancellation: formData.freeCancellation,
      breakfastIncluded: formData.breakfastIncluded,
      featured: formData.featured,
      ownerId: formData.ownerId || null
    };

    if (editingId) {
      updateProp.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast.success("Property updated");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListAdminPropertiesQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to update")
      });
    } else {
      createProp.mutate({ data: payload }, {
        onSuccess: () => {
          toast.success("Property created");
          setIsDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListAdminPropertiesQueryKey() });
        },
        onError: (err) => toast.error(err.message || "Failed to create")
      });
    }
  };

  return (
    <AdminLayout title="Manage Properties">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <p className="text-muted-foreground">Manage resorts, hotels, and packages.</p>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Property</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
             <DialogTitle>
               {editingId && editingPropertyNumber
                 ? `Edit Property · ${formatPropertyReference(editingPropertyNumber)}`
                 : "Add New Property"}
             </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                {editingId && editingPropertyNumber && (
                  <div className="col-span-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Property reference </span>
                    <span className="font-mono font-semibold text-secondary">{formatPropertyReference(editingPropertyNumber)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">Stable reference from the property record.</span>
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Name</label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Category</label>
                  <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary">
                    {editingId && !propertyCategories?.some(category => category.slug === formData.category) && (
                      <option value={formData.category}>{formData.category} (legacy)</option>
                    )}
                    {propertyCategories?.map(category => (
                      <option key={category.id} value={category.slug}>{category.name}</option>
                    ))}
                  </select>
                </div>
                <LocationFields
                  value={{ country: formData.country, state: formData.state, city: formData.city, area: formData.area, pincode: formData.pincode, latitude: formData.latitude, longitude: formData.longitude }}
                  onChange={(patch) => setFormData({ ...formData, ...patch })}
                />
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Address</label>
                  <Input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-secondary mb-1 block">Description</label>
                  <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border border-input rounded-xl p-3 h-24 outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <PropertyImageUploader
                  mainValue={formData.imageUrl}
                  galleryValue={formData.images}
                  onMainChange={(imageUrl) => setFormData({ ...formData, imageUrl })}
                  onGalleryChange={(images) => setFormData({ ...formData, images })}
                />
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Amenities (comma separated)</label>
                  <Input required value={formData.amenities} onChange={e => setFormData({...formData, amenities: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Policies (comma separated)</label>
                  <Input required value={formData.policies} onChange={e => setFormData({...formData, policies: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Starting Price (INR)</label>
                  <Input type="number" required value={formData.startingPrice} onChange={e => setFormData({...formData, startingPrice: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-secondary mb-1 block">Property Owner (Optional)</label>
                  <select value={formData.ownerId} onChange={e => setFormData({...formData, ownerId: e.target.value})} className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Unassigned (Admin Managed)</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex gap-4 items-end pb-2 border-t pt-4">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formData.freeCancellation} onChange={e => setFormData({...formData, freeCancellation: e.target.checked})} /> Free Cancel</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formData.breakfastIncluded} onChange={e => setFormData({...formData, breakfastIncluded: e.target.checked})} /> Breakfast</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formData.featured} onChange={e => setFormData({...formData, featured: e.target.checked})} /> Featured</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createProp.isPending || updateProp.isPending}>Save Property</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-secondary">Filter properties</h2>
          </div>
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="text-property-match-count"
          >
            Showing {filteredProperties.length} of {(properties ?? []).length}{" "}
            {(properties ?? []).length === 1 ? "property" : "properties"}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by property name or PM reference"
              aria-label="Search properties by name or PM reference"
              data-testid="input-property-search"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter properties by status"
            data-testid="select-property-status-filter"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All statuses</option>
            {filterOptions.statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter properties by category"
            data-testid="select-property-category-filter"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All categories</option>
            {filterOptions.categories.map((category) => (
              <option key={category} value={category}>{categoryNames.get(category) ?? category}</option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            aria-label="Filter properties by state"
            data-testid="select-property-state-filter"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All states</option>
            {filterOptions.states.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
            aria-label="Filter properties by city"
            data-testid="select-property-city-filter"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All cities</option>
            {filterOptions.cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            data-testid="button-clear-property-filters"
            className="h-10 gap-2 sm:col-span-2 lg:col-span-1"
          >
            Clear filters
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                 <th className="p-4 font-bold">Property reference</th>
                <th className="p-4 font-bold">Property</th>
                <th className="p-4 font-bold">Location</th>
                <th className="p-4 font-bold">Category</th>
                <th className="p-4 font-bold">Price</th>
                <th className="p-4 font-bold">Rating</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : (properties ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <p className="font-semibold text-secondary" data-testid="text-properties-empty">No properties yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add a property to start managing your inventory.</p>
                  </td>
                </tr>
              ) : filteredProperties.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <p className="font-semibold text-secondary" data-testid="text-properties-no-results">No matching properties</p>
                    <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      className="mt-4"
                      data-testid="button-clear-property-filters-empty"
                    >
                      Clear filters
                    </Button>
                  </td>
                </tr>
              ) : filteredProperties.map(prop => (
                <tr key={prop.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 whitespace-nowrap">
                    <span className="font-mono text-sm font-semibold text-secondary" data-testid={`text-property-reference-${prop.propertyNumber}`}>
                      {formatPropertyReference(prop.propertyNumber)}
                    </span>
                  </td>
                  <td className="p-4 flex items-center gap-3">
                    <img src={prop.imageUrl} alt={prop.name} className="w-12 h-12 rounded object-cover" />
                    <div>
                      <p className="font-bold text-secondary text-sm">{prop.name}</p>
                      {prop.featured && <Badge variant="secondary" className="text-[10px] py-0 px-1 mt-0.5">Featured</Badge>}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-secondary">{prop.city}, {prop.area}</td>
                  <td className="p-4"><Badge variant="outline" className="capitalize">{prop.category}</Badge></td>
                  <td className="p-4 text-sm font-bold text-secondary">{formatPrice(prop.startingPrice)}</td>
                  <td className="p-4 text-sm text-muted-foreground">{prop.rating.toFixed(1)} ({prop.reviewCount})</td>
                  <td className="p-4">
                    <Badge variant="outline" className={`capitalize ${
                      prop.status === 'active' ? 'border-green-200 text-green-700 bg-green-50' :
                      prop.status === 'approved' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                      prop.status === 'pending' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                      prop.status === 'suspended' ? 'border-orange-200 text-orange-700 bg-orange-50' :
                      'border-red-200 text-red-700 bg-red-50'
                    }`}>{prop.status ?? 'active'}</Badge>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {prop.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 hover:bg-blue-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'approved')}>
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'rejected')}>
                            <XCircle className="w-4 h-4" /> Reject
                          </Button>
                        </>
                      )}
                      {prop.status === 'approved' && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-green-700 border-green-200 hover:bg-green-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'active')}>
                            <CheckCircle2 className="w-4 h-4" /> Activate
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'rejected')}>
                            <XCircle className="w-4 h-4" /> Reject
                          </Button>
                        </>
                      )}
                      {prop.status === 'active' && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'suspended')}>
                          <PauseCircle className="w-4 h-4" /> Suspend
                        </Button>
                      )}
                      {prop.status === 'suspended' && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-green-700 border-green-200 hover:bg-green-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'active')}>
                          <CheckCircle2 className="w-4 h-4" /> Activate
                        </Button>
                      )}
                      {prop.status === 'rejected' && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 hover:bg-blue-50" disabled={setStatus.isPending} onClick={() => handleStatus(prop.id, 'approved')}>
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline" className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50" title="Manage Rooms">
                        <Link href={`/admin/properties/${prop.id}/rooms`}><DoorOpen className="w-4 h-4" /></Link>
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleEdit(prop)} title="Edit Property"><Edit2 className="w-4 h-4" /></Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(prop.id)} title="Delete Property"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
