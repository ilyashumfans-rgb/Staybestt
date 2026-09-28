import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  useListAdminPostalDirectory,
  useListAdminPostalDirectoryStates,
  useListAdminPostalDirectoryDistricts,
  useUpdateAdminPostalDirectory,
  useSetPostalDirectoryApproval,
  useBulkSetPostalDirectoryApproval,
  getListAdminPostalDirectoryQueryKey,
  getListAdminPostalDirectoryDistrictsQueryKey,
  getListAdminLocationsQueryKey,
  getListLocationsQueryKey,
  PostalDirectoryEntry
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Search, AlertCircle, Save, CheckSquare, XSquare } from "lucide-react";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function PostalDirectoryRow({
  entry,
  isSelected,
  onToggleSelect,
  refresh
}: {
  entry: PostalDirectoryEntry;
  isSelected: boolean;
  onToggleSelect: (id: number, selected: boolean) => void;
  refresh: () => void;
}) {
  const [localCity, setLocalCity] = useState(entry.cityOrTaluk || "");
  const queryClient = useQueryClient();
  const updateLabel = useUpdateAdminPostalDirectory();
  const setApproval = useSetPostalDirectoryApproval();

  useEffect(() => {
    setLocalCity(entry.cityOrTaluk || "");
  }, [entry.cityOrTaluk]);

  const isDirty = localCity.trim() !== (entry.cityOrTaluk || "").trim();

  const handleSaveLabel = () => {
    if (!localCity.trim()) {
      toast.error("City/Taluk cannot be empty");
      return;
    }
    updateLabel.mutate({
      id: entry.id,
      data: { cityOrTaluk: localCity.trim() }
    }, {
      onSuccess: () => {
        toast.success("Label updated");
        refresh();
      },
      onError: (err: any) => {
        toast.error(err?.data?.message || err?.message || "Failed to update label");
      }
    });
  };

  const handleToggleApproval = (checked: boolean) => {
    if (checked && !entry.cityOrTaluk && !localCity.trim()) {
      toast.error("Needs city confirmation before approval");
      return;
    }
    setApproval.mutate({
      id: entry.id,
      data: {
        approved: checked,
        cityOrTaluk: checked && isDirty ? localCity.trim() : undefined
      }
    }, {
      onSuccess: () => {
        toast.success(checked ? "Location approved" : "Location unapproved");
        refresh();
        queryClient.invalidateQueries({ queryKey: getListAdminLocationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
      },
      onError: (err: any) => {
        toast.error(err?.data?.message || err?.message || "Failed to change approval");
      }
    });
  };

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_80px_100px] items-center gap-3 border-b px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex justify-center">
        <Checkbox checked={isSelected} onCheckedChange={(c) => onToggleSelect(entry.id, !!c)} />
      </div>
      <div className="text-sm font-medium">{entry.district}</div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={localCity}
            onChange={(e) => setLocalCity(e.target.value)}
            placeholder="Needs city confirmation"
            className={`h-8 text-sm ${!entry.cityOrTaluk && !localCity ? "border-destructive/50 focus-visible:ring-destructive bg-destructive/5" : ""}`}
          />
          {!entry.cityOrTaluk && !localCity && (
            <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive/70" />
          )}
        </div>
        {isDirty && (
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 text-primary shrink-0"
            onClick={handleSaveLabel}
            disabled={updateLabel.isPending}
            title="Save City/Taluk"
          >
            {updateLabel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        )}
      </div>
      <div className="text-sm truncate" title={entry.officeName}>{entry.officeName}</div>
      <div className="text-sm text-muted-foreground">{entry.pincode}</div>
      <div className="flex justify-end">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`approve-${entry.id}`}
            checked={entry.approved}
            onCheckedChange={handleToggleApproval}
            disabled={setApproval.isPending}
          />
          <label htmlFor={`approve-${entry.id}`} className="text-xs font-medium cursor-pointer select-none">
            {entry.approved ? "Approved" : "Approve"}
          </label>
        </div>
      </div>
    </div>
  );
}

export function PostalDirectory() {
  const queryClient = useQueryClient();

  const [stateFilter, setStateFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [approvedFilter, setApprovedFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    setDistrictFilter("all");
  }, [stateFilter]);

  useEffect(() => {
    setPage(1);
  }, [districtFilter, approvedFilter, debouncedSearch]);

  const { data: statesData, isLoading: statesLoading } = useListAdminPostalDirectoryStates();
  const distParams = { state: stateFilter !== "all" ? stateFilter : undefined };
  const { data: districtsData, isLoading: districtsLoading } = useListAdminPostalDirectoryDistricts(
    distParams,
    { query: { enabled: stateFilter !== "all", queryKey: getListAdminPostalDirectoryDistrictsQueryKey(distParams) } }
  );

  const queryParams = useMemo(() => ({
    page,
    state: stateFilter !== "all" ? stateFilter : undefined,
    district: districtFilter !== "all" ? districtFilter : undefined,
    approved: approvedFilter === "true" ? true : approvedFilter === "false" ? false : undefined,
    q: debouncedSearch || undefined,
  }), [page, stateFilter, districtFilter, approvedFilter, debouncedSearch]);

  const { data: directoryData, isLoading, isError } = useListAdminPostalDirectory(queryParams);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  useEffect(() => {
    setSelectedIds(new Set());
  }, [directoryData]);

  const handleToggleSelect = useCallback((id: number, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((selected: boolean) => {
    if (!directoryData) return;
    if (selected) {
      setSelectedIds(new Set(directoryData.items.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [directoryData]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListAdminPostalDirectoryQueryKey() });
  }, [queryClient]);

  const bulkSetApproval = useBulkSetPostalDirectoryApproval();

  const handleBulkAction = (approve: boolean) => {
    if (selectedIds.size === 0) return;
    
    if (approve && directoryData) {
      const itemsMap = new Map(directoryData.items.map(i => [i.id, i]));
      const unconfirmedCount = Array.from(selectedIds).filter(id => {
        const item = itemsMap.get(id);
        return item && !item.cityOrTaluk;
      }).length;

      if (unconfirmedCount > 0) {
        toast.error(`Cannot bulk approve: ${unconfirmedCount} selected location(s) need city confirmation. Please save their City/Taluk first.`);
        return;
      }
    }

    bulkSetApproval.mutate({
      data: { ids: Array.from(selectedIds), approved: approve }
    }, {
      onSuccess: () => {
        toast.success(`Successfully ${approve ? "approved" : "unapproved"} ${selectedIds.size} locations.`);
        setSelectedIds(new Set());
        refresh();
        queryClient.invalidateQueries({ queryKey: getListAdminLocationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
      },
      onError: (err: any) => {
        toast.error(err?.data?.message || err?.message || "Bulk operation failed");
      }
    });
  };

  const snapshotDate = directoryData?.items[0]?.source?.sourceRevisionDate || "2024-05-05";

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-secondary">India Postal Directory</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Browse and approve locations from the official directory. Source provenance snapshot revision date: <span className="font-semibold">{snapshotDate}</span>. Unconfirmed city labels must be provided before approval.
          </p>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">State</label>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent position="popper" collisionPadding={12} style={{ maxHeight: 'min(280px, var(--radix-select-content-available-height))', overflowY: 'auto' }}>
                <SelectItem value="all">All States</SelectItem>
                {statesData?.map(s => (
                  <SelectItem key={s.state} value={s.state}>{s.state} ({s.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">District</label>
            <Select value={districtFilter} onValueChange={setDistrictFilter} disabled={stateFilter === "all"}>
              <SelectTrigger>
                <SelectValue placeholder={stateFilter === "all" ? "Select State first" : "All Districts"} />
              </SelectTrigger>
              <SelectContent position="popper" collisionPadding={12} style={{ maxHeight: 'min(280px, var(--radix-select-content-available-height))', overflowY: 'auto' }}>
                <SelectItem value="all">All Districts</SelectItem>
                {districtsData?.map(d => (
                  <SelectItem key={d.district} value={d.district}>{d.district} ({d.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">Status</label>
            <Select value={approvedFilter} onValueChange={setApprovedFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent position="popper" collisionPadding={12} style={{ maxHeight: 'min(280px, var(--radix-select-content-available-height))', overflowY: 'auto' }}>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="true">Approved</SelectItem>
                <SelectItem value="false">Unapproved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="City, area, or PIN..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between border animate-in slide-in-from-top-2">
            <span className="text-sm font-bold text-secondary px-2">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleBulkAction(false)} disabled={bulkSetApproval.isPending}>
                <XSquare className="w-4 h-4" />
                Unapprove
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => handleBulkAction(true)} disabled={bulkSetApproval.isPending}>
                <CheckSquare className="w-4 h-4" />
                Approve
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_80px_100px] gap-3 border-b bg-muted/20 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <div className="flex justify-center">
            <Checkbox 
              checked={directoryData?.items.length ? selectedIds.size === directoryData.items.length : false}
              onCheckedChange={(c) => handleToggleAll(!!c)}
              disabled={!directoryData?.items.length}
            />
          </div>
          <div>District</div>
          <div>City / Taluk</div>
          <div>Area / Office</div>
          <div>Pincode</div>
          <div className="text-right">Approval</div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="py-20 text-center text-destructive font-medium">
            Failed to load directory.
          </div>
        ) : directoryData?.items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            No locations found matching the current filters.
          </div>
        ) : (
          <div className="divide-y border-b">
            {directoryData?.items.map(entry => (
              <PostalDirectoryRow 
                key={entry.id} 
                entry={entry} 
                isSelected={selectedIds.has(entry.id)}
                onToggleSelect={handleToggleSelect}
                refresh={refresh}
              />
            ))}
          </div>
        )}

        {directoryData && directoryData.pagination.total > 0 && (
          <div className="p-4 flex items-center justify-between bg-muted/5">
            <div className="text-sm text-muted-foreground">
              Showing {((page - 1) * directoryData.pagination.pageSize) + 1} to {Math.min(page * directoryData.pagination.pageSize, directoryData.pagination.total)} of {directoryData.pagination.total} entries
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page * directoryData.pagination.pageSize >= directoryData.pagination.total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
