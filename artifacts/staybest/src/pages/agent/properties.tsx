import { useState } from "react";
import { LocationFields } from "@/components/LocationFields";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { 
  useListAgentSubmittedProperties, 
  getListAgentSubmittedPropertiesQueryKey,
  useSubmitAgentProperty,
  useGetMe,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Building2 } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AgentProperties() {
  const queryClient = useQueryClient();
  const { isSignedIn } = useUser();
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  const isAgent = me?.role === 'agent' || me?.role === 'admin';

  const { data: properties, isLoading } = useListAgentSubmittedProperties({
    query: { enabled: isAgent, queryKey: getListAgentSubmittedPropertiesQueryKey() }
  });

  const submitProp = useSubmitAgentProperty();
  const [registerOpen, setRegisterOpen] = useState(false);
  
  const [regForm, setRegForm] = useState({
    name: "", category: "prime", country: "", state: "", city: "", area: "", pincode: "",
    latitude: "", longitude: "",
    address: "", description: "", imageUrl: "", startingPrice: ""
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    submitProp.mutate({
      data: {
        name: regForm.name.trim(),
        category: regForm.category,
        country: regForm.country.trim(),
        state: regForm.state.trim(),
        city: regForm.city.trim(),
        area: regForm.area.trim(),
        pincode: regForm.pincode.trim(),
        address: regForm.address.trim(),
        description: regForm.description.trim(),
        imageUrl: regForm.imageUrl.trim(),
        startingPrice: Number(regForm.startingPrice),
        latitude: regForm.latitude ? Number(regForm.latitude) : null,
        longitude: regForm.longitude ? Number(regForm.longitude) : null,
      }
    }, {
      onSuccess: () => {
        toast.success("Property submitted for approval");
        setRegisterOpen(false);
        setRegForm({
          name: "", category: "prime", country: "", state: "", city: "", area: "", pincode: "",
          latitude: "", longitude: "",
          address: "", description: "", imageUrl: "", startingPrice: ""
        });
        queryClient.invalidateQueries({ queryKey: getListAgentSubmittedPropertiesQueryKey() });
      },
      onError: (err: any) => toast.error(err?.response?.data?.message || err.message || "Failed to submit"),
    });
  };

  return (
    <AgentLayout title="Submitted Properties">
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex-1">
          <h4 className="text-secondary font-bold mb-1">Submit a new property lead</h4>
          <p className="text-muted-foreground text-sm">Submit hotels or resorts that should join StayBest. We'll review them and handle onboarding.</p>
        </div>
        <Button className="gap-2 shrink-0 h-12 px-6" onClick={() => setRegisterOpen(true)} data-testid="button-agent-submit-property">
          <Plus className="w-4 h-4" /> Submit Property
        </Button>
      </div>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit Property Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRegister} className="space-y-4 py-2" data-testid="form-agent-property-submission">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-bold text-secondary mb-1 block">Property name *</label>
                <Input required value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} data-testid="input-agent-property-name" />
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1 block">Category *</label>
                <select required value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full h-10 border border-input rounded-md px-3 bg-white" data-testid="select-agent-property-category">
                  <option value="prime">Prime</option>
                  <option value="luxury">Luxury</option>
                  <option value="budget">Budget</option>
                  <option value="package">Package</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-secondary mb-1 block">Starting price estimate (₹/night) *</label>
                <Input type="number" min="0" required value={regForm.startingPrice} onChange={e => setRegForm({...regForm, startingPrice: e.target.value})} data-testid="input-agent-property-price" />
              </div>
              
              <LocationFields
                value={{ 
                  country: regForm.country, 
                  state: regForm.state, 
                  city: regForm.city, 
                  area: regForm.area, 
                  pincode: regForm.pincode,
                  latitude: regForm.latitude,
                  longitude: regForm.longitude,
                }}
                onChange={(patch) => setRegForm({ ...regForm, ...patch })}
              />

              <div className="col-span-2">
                <label className="text-sm font-bold text-secondary mb-1 block">Full address *</label>
                <Input required value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} data-testid="input-agent-property-address" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-bold text-secondary mb-1 block">Brief Description *</label>
                <textarea required rows={3} className="w-full border border-input rounded-md p-3 text-sm outline-none focus:ring-2 focus:ring-primary" value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} data-testid="input-agent-property-description" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-bold text-secondary mb-1 block">Reference Image URL *</label>
                <Input required placeholder="https://..." value={regForm.imageUrl} onChange={e => setRegForm({...regForm, imageUrl: e.target.value})} data-testid="input-agent-property-image-url" />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)} data-testid="button-agent-cancel-property-submission">Cancel</Button>
              <Button type="submit" disabled={submitProp.isPending} data-testid="button-agent-confirm-property-submission">
                {submitProp.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {submitProp.isPending ? "Submitting..." : "Submit Lead"}
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
                <th className="p-4 font-bold">Price Est.</th>
                <th className="p-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td>
                </tr>
              ) : properties?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Building2 className="w-8 h-8 mb-2 opacity-50" />
                      <p>You haven't submitted any properties yet.</p>
                    </div>
                  </td>
                </tr>
              ) : properties?.map(prop => (
                <tr key={prop.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    <img src={prop.imageUrl} alt={prop.name} className="w-12 h-12 rounded object-cover" />
                    <div>
                      <p className="font-bold text-secondary text-sm">{prop.name}</p>
                      <Badge variant="outline" className="text-[10px] py-0 px-1 capitalize mt-0.5">{prop.category}</Badge>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-secondary">{prop.city}, {prop.area}</td>
                  <td className="p-4 text-sm font-bold text-secondary">{formatPrice(prop.startingPrice)}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold capitalize ${
                      prop.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' :
                      prop.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      prop.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-slate-50 text-slate-700 border border-slate-200'
                    }`} data-testid={`status-agent-property-${prop.id}`}>
                      {prop.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AgentLayout>
  );
}
