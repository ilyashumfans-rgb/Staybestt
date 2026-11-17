import { useMemo, useState } from "react";
import { groupSelectedAmenities, useGetAmenityCatalog, type AmenityGroup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AmenityIcon } from "./AmenityIcon";

export function useGroupedAmenities(selected: string[]) {
  const { data, isLoading, isError, refetch } = useGetAmenityCatalog();
  const groups = useMemo(() => groupSelectedAmenities(data?.categories ?? [], selected), [data, selected]);
  return { groups, isLoading, isError, refetch };
}

function Groups({ groups, cols }: { groups: AmenityGroup[]; cols: string }) {
  return (
    <div className="divide-y divide-border">
      {groups.map(g => (
        <div key={g.id} className="py-5 first:pt-0 last:pb-0">
          <h3 className="mb-4 text-base font-semibold text-secondary">{g.name}</h3>
          <ul className={`grid gap-x-6 gap-y-4 ${cols}`}>
            {g.amenities.map(a => (
              <li key={a.id} className="flex items-center gap-3 text-sm text-secondary"><AmenityIcon icon={a.icon} /><span>{a.name}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AmenitiesShowcase({ selected }: { selected: string[] }) {
  const { groups, isLoading, isError, refetch } = useGroupedAmenities(selected);
  const [open, setOpen] = useState(false);
  if (selected.length === 0) return <p className="text-muted-foreground text-sm">No amenities have been listed for this property.</p>;
  if (isLoading) return <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (isError) return <p className="text-sm text-destructive">Could not load amenity categories. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>;
  return (
    <>
      <Groups groups={groups} cols="grid-cols-1 sm:grid-cols-2 md:grid-cols-3" />
      <Button type="button" variant="outline" className="mt-6" onClick={() => setOpen(true)} data-testid="button-view-all-amenities">View all amenities</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} className="max-h-[85dvh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto rounded-xl bg-white p-6 sm:p-8">
          <DialogTitle className="border-b pb-4 text-xl font-semibold text-secondary">USP &amp; Amenities</DialogTitle>
          <Groups groups={groups} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExperiencesList({ selected }: { selected: string[] }) {
  const { groups } = useGroupedAmenities(selected);
  const exp = groups.find(g => g.name.toLowerCase().includes("experience"));
  if (!exp) return <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Experiences have not been supplied for this property.</div>;
  return <Groups groups={[exp]} cols="grid-cols-1 sm:grid-cols-2 md:grid-cols-3" />;
}
