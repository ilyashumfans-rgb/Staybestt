import { useEffect, useMemo, useRef, useState } from "react";
import { useListLocations, getListLocationsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface LocationValue {
  country: string;
  state: string;
  city: string;
  area: string;
  pincode: string;
  latitude: string;
  longitude: string;
}

export interface LocationFieldsProps {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  /**
   * Use only rows returned by the managed location directory. This is intended
   * for partner property create/edit; other callers retain the legacy
   * free-text-compatible behaviour by leaving it unset.
   */
  strictApproved?: boolean;
}

/**
 * Shared location picker. Partner property forms opt into the strict,
 * approved-directory picker; all other callers keep the legacy behaviour.
 */
export function LocationFields({ strictApproved, value, onChange }: LocationFieldsProps) {
  if (strictApproved) {
    return <StrictLocationFields value={value} onChange={onChange} />;
  }
  return <LegacyLocationFields value={value} onChange={onChange} />;
}

function LegacyLocationFields({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
}) {
  const { data: locations } = useListLocations({ query: { queryKey: getListLocationsQueryKey() } });
  const [locating, setLocating] = useState(false);
  const hydratedLegacyKey = useRef<string | null>(null);

  useEffect(() => {
    const legacyKey = `${value.city}|${value.area}|${value.pincode}`.toLowerCase();
    if (
      value.country ||
      value.state ||
      !value.city ||
      !locations?.length ||
      hydratedLegacyKey.current === legacyKey
    ) return;
    hydratedLegacyKey.current = legacyKey;
    const match = locations.find(
      (location) =>
        location.city.toLowerCase() === value.city.toLowerCase() &&
        (!value.area || location.area.toLowerCase() === value.area.toLowerCase()) &&
        (!value.pincode || location.pincode === value.pincode),
    );
    if (match) {
      onChange({ country: match.country, state: match.state });
    }
  }, [locations, onChange, value.area, value.city, value.country, value.pincode, value.state]);

  const countries = useMemo(
    () => [...new Set((locations ?? []).map((location) => location.country))].sort(),
    [locations],
  );

  const states = useMemo(
    () => [...new Set(
      (locations ?? [])
        .filter((location) => location.country === value.country)
        .map((location) => location.state),
    )].sort(),
    [locations, value.country],
  );

  const cities = useMemo(() => {
    const set = new Set(
      (locations ?? [])
        .filter((location) => location.country === value.country && location.state === value.state)
        .map((location) => location.city),
    );
    if (value.city) set.add(value.city);
    return [...set].sort();
  }, [locations, value.city, value.country, value.state]);

  const areas = useMemo(() => {
    const rows = (locations ?? []).filter(
      (l) =>
        l.country === value.country &&
        l.state === value.state &&
        l.city.toLowerCase() === value.city.toLowerCase(),
    );
    const seen = new Set<string>();
    const out: { area: string; pincode: string; latitude?: number | null; longitude?: number | null }[] = [];
    for (const r of rows) {
      const key = r.area.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const locationWithCoordinates = r as typeof r & {
          latitude?: number | null;
          longitude?: number | null;
        };
        out.push({
          area: r.area,
          pincode: r.pincode,
          latitude: locationWithCoordinates.latitude,
          longitude: locationWithCoordinates.longitude,
        });
      }
    }
    if (value.area && !seen.has(value.area.toLowerCase())) {
      out.push({ area: value.area, pincode: value.pincode });
    }
    return out.sort((a, b) => a.area.localeCompare(b.area));
  }, [locations, value.city, value.area, value.country, value.pincode, value.state]);

  const hasManaged = (locations?.length ?? 0) > 0;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
        toast.success("Location captured");
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location. Please allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const selectCls =
    "w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white";

  return (
    <>
      {hasManaged && (
        <>
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">Country</label>
            <select
              required
              value={value.country}
              onChange={(e) => {
                onChange({ country: e.target.value, state: "", city: "", area: "", pincode: "" });
              }}
              className={selectCls}
            >
              <option value="">Select country</option>
              {countries.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">State</label>
            <select
              required
              value={value.state}
              onChange={(e) => {
                onChange({ state: e.target.value, city: "", area: "", pincode: "" });
              }}
              className={selectCls}
              disabled={!value.country}
            >
              <option value="">{value.country ? "Select state" : "Select country first"}</option>
              {states.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {!hasManaged && (
        <>
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">Country</label>
            <Input
              required
              value={value.country}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="Country"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-secondary mb-1 block">State</label>
            <Input
              required
              value={value.state}
              onChange={(e) => onChange({ state: e.target.value })}
              placeholder="State"
            />
          </div>
        </>
      )}
      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">City</label>
        {hasManaged ? (
          <select
            required
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value, area: "", pincode: "" })}
            className={selectCls}
          >
            <option value="">Select city</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <Input required value={value.city} onChange={(e) => onChange({ city: e.target.value })} />
        )}
      </div>
      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">Area</label>
        {hasManaged ? (
          <select
            required
            value={value.area}
            onChange={(e) => {
              const found = areas.find((a) => a.area === e.target.value);
              onChange({
                area: e.target.value,
                pincode: found?.pincode ?? "",
                ...(found?.latitude != null ? { latitude: String(found.latitude) } : {}),
                ...(found?.longitude != null ? { longitude: String(found.longitude) } : {}),
              });
            }}
            className={selectCls}
            disabled={!value.city || !value.state}
          >
            <option value="">{value.city ? "Select area" : "Select city first"}</option>
            {areas.map((a) => (
              <option key={a.area} value={a.area}>{a.area}</option>
            ))}
          </select>
        ) : (
          <Input required value={value.area} onChange={(e) => onChange({ area: e.target.value })} />
        )}
      </div>
      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">Pincode</label>
        <Input
          value={value.pincode}
          placeholder={hasManaged ? "Auto-filled from area" : ""}
          onChange={(e) => onChange({ pincode: e.target.value })}
        />
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Latitude</label>
          <Input
            type="number"
            step="any"
            value={value.latitude}
            placeholder="e.g. 19.076090"
            onChange={(e) => onChange({ latitude: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Longitude</label>
          <Input
            type="number"
            step="any"
            value={value.longitude}
            placeholder="e.g. 72.877426"
            onChange={(e) => onChange({ longitude: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Button type="button" variant="outline" className="gap-2" onClick={useCurrentLocation} disabled={locating}>
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            Use my current location
          </Button>
        </div>
      </div>
    </>
  );
}

type ApprovedLocationRow = {
  country: string;
  state: string;
  district?: string | null;
  city: string;
  area: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
};

const NO_DIRECTORY_DISTRICT = "__directory_district_not_listed__";

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function uniqueDirectoryValues(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalized(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function districtKey(district: string | null | undefined) {
  return district?.trim() ? district.trim() : NO_DIRECTORY_DISTRICT;
}

function districtLabel(key: string, source?: string | null) {
  return key === NO_DIRECTORY_DISTRICT ? "District not listed in directory" : source || key;
}

function directoryRowsMatchValue(row: ApprovedLocationRow, value: LocationValue) {
  return (
    normalized(row.country) === normalized(value.country) &&
    normalized(row.state) === normalized(value.state) &&
    normalized(row.city) === normalized(value.city) &&
    normalized(row.area) === normalized(value.area) &&
    normalized(row.pincode) === normalized(value.pincode)
  );
}

function coordinatesForRow(row?: ApprovedLocationRow) {
  return {
    latitude: row?.latitude != null ? String(row.latitude) : "",
    longitude: row?.longitude != null ? String(row.longitude) : "",
  };
}

function StrictLocationFields({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
}) {
  const locationQuery = useListLocations({
    query: { queryKey: getListLocationsQueryKey() },
  });
  const locations = (locationQuery.data ?? []) as ApprovedLocationRow[];
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [replacementStarted, setReplacementStarted] = useState(false);
  const [locating, setLocating] = useState(false);

  const hasCurrentLocationValues = Boolean(
    value.country || value.state || value.city || value.area || value.pincode,
  );
  const directoryReady = !locationQuery.isLoading && !locationQuery.isError && locationQuery.data !== undefined;

  const currentMatches = useMemo(
    () => locations.filter((location) => directoryRowsMatchValue(location, value)),
    [locations, value],
  );

  const currentDistrictKeys = useMemo(
    () => [...new Set(currentMatches.map((location) => districtKey(location.district)))],
    [currentMatches],
  );
  const currentDirectoryRow = currentMatches[0];
  const inferredCurrentDistrict =
    currentDistrictKeys.length === 1 ? currentDistrictKeys[0] : "";
  const currentIsApproved =
    directoryReady &&
    Boolean(value.country && value.state && value.city && value.area && value.pincode) &&
    currentMatches.length > 0 &&
    currentDistrictKeys.length === 1;
  const legacyLocation = directoryReady && hasCurrentLocationValues && !currentIsApproved;
  const controlsValue = currentIsApproved || replacementStarted || !hasCurrentLocationValues
    ? currentIsApproved && currentDirectoryRow
      ? {
          ...value,
          country: currentDirectoryRow.country,
          state: currentDirectoryRow.state,
          city: currentDirectoryRow.city,
          area: currentDirectoryRow.area,
          pincode: currentDirectoryRow.pincode,
        }
      : value
    : { ...value, country: "", state: "", city: "", area: "", pincode: "" };
  const effectiveDistrict = replacementStarted
    ? selectedDistrict
    : currentIsApproved
      ? selectedDistrict || inferredCurrentDistrict
      : selectedDistrict;
  const requireSelection = !hasCurrentLocationValues || currentIsApproved || replacementStarted;

  useEffect(() => {
    if (!currentIsApproved || replacementStarted || !inferredCurrentDistrict) return;
    setSelectedDistrict(inferredCurrentDistrict);
  }, [currentIsApproved, inferredCurrentDistrict, replacementStarted]);

  const countries = useMemo(
    () => uniqueDirectoryValues(locations.map((location) => location.country)),
    [locations],
  );
  const states = useMemo(
    () =>
      uniqueDirectoryValues(
        locations
          .filter((location) => normalized(location.country) === normalized(controlsValue.country))
          .map((location) => location.state),
      ),
    [controlsValue.country, locations],
  );
  const districtOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const location of locations) {
      if (
        normalized(location.country) !== normalized(controlsValue.country) ||
        normalized(location.state) !== normalized(controlsValue.state)
      ) {
        continue;
      }
      const key = districtKey(location.district);
      if (!options.has(key)) options.set(key, districtLabel(key, location.district));
    }
    return [...options.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [controlsValue.country, controlsValue.state, locations]);
  const rowsForDistrict = useMemo(
    () =>
      locations.filter(
        (location) =>
          normalized(location.country) === normalized(controlsValue.country) &&
          normalized(location.state) === normalized(controlsValue.state) &&
          Boolean(effectiveDistrict) &&
          districtKey(location.district) === effectiveDistrict,
      ),
    [controlsValue.country, controlsValue.state, effectiveDistrict, locations],
  );
  const cities = useMemo(
    () => uniqueDirectoryValues(rowsForDistrict.map((location) => location.city)),
    [rowsForDistrict],
  );
  const rowsForCity = useMemo(
    () =>
      rowsForDistrict.filter(
        (location) => normalized(location.city) === normalized(controlsValue.city),
      ),
    [controlsValue.city, rowsForDistrict],
  );
  const areas = useMemo(
    () => uniqueDirectoryValues(rowsForCity.map((location) => location.area)),
    [rowsForCity],
  );
  const rowsForArea = useMemo(
    () =>
      rowsForCity.filter(
        (location) => normalized(location.area) === normalized(controlsValue.area),
      ),
    [controlsValue.area, rowsForCity],
  );
  const pinOptions = useMemo(() => {
    const byPin = new Map<string, ApprovedLocationRow>();
    for (const location of rowsForArea) {
      if (!byPin.has(normalized(location.pincode))) byPin.set(normalized(location.pincode), location);
    }
    return [...byPin.values()].sort((a, b) => a.pincode.localeCompare(b.pincode));
  }, [rowsForArea]);
  const selectedPinRow = pinOptions.find(
    (location) => normalized(location.pincode) === normalized(controlsValue.pincode),
  );

  const selectCls =
    "w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white disabled:bg-muted disabled:text-muted-foreground";
  const markReplacement = () => setReplacementStarted(true);
  const clearCoordinates = { latitude: "", longitude: "" };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
        toast.success("Location captured");
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location. Please allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const statusMessage = locationQuery.isLoading
    ? "Loading the approved location directory…"
    : locationQuery.isError
      ? "The approved location directory could not be loaded. Free-text location values are disabled."
      : locations.length === 0
        ? "No approved locations are available yet. A property cannot be assigned a new location until the directory is populated."
        : null;

  return (
    <>
      {(legacyLocation || (hasCurrentLocationValues && !directoryReady)) && (
        <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">
                {directoryReady ? "Legacy location not in the approved directory" : "Current location kept while directory is unavailable"}
              </p>
              <p className="mt-1">
                The current value is read-only and will remain unchanged unless you choose a replacement from the approved directory below.
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><dt className="font-semibold inline">Country: </dt><dd className="inline">{value.country || "—"}</dd></div>
                <div><dt className="font-semibold inline">State: </dt><dd className="inline">{value.state || "—"}</dd></div>
                <div><dt className="font-semibold inline">City / Taluk: </dt><dd className="inline">{value.city || "—"}</dd></div>
                <div><dt className="font-semibold inline">Area: </dt><dd className="inline">{value.area || "—"}</dd></div>
                <div><dt className="font-semibold inline">PIN: </dt><dd className="inline">{value.pincode || "—"}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {statusMessage}
        </div>
      )}

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">Country</label>
        <select
          required={requireSelection}
          value={controlsValue.country}
          onChange={(event) => {
            markReplacement();
            setSelectedDistrict("");
            onChange({
              country: event.target.value,
              state: "",
              city: "",
              area: "",
              pincode: "",
              ...clearCoordinates,
            });
          }}
          className={selectCls}
        >
          <option value="">Select country</option>
          {countries.map((country) => <option key={country} value={country}>{country}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">State</label>
        <select
          required={requireSelection}
          value={controlsValue.state}
          onChange={(event) => {
            markReplacement();
            setSelectedDistrict("");
            onChange({
              state: event.target.value,
              city: "",
              area: "",
              pincode: "",
              ...clearCoordinates,
            });
          }}
          className={selectCls}
          disabled={!controlsValue.country || states.length === 0}
        >
          <option value="">{controlsValue.country ? "Select state" : "Select country first"}</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">
          District <span className="font-normal text-muted-foreground">(directory filter; not stored on property)</span>
        </label>
        <select
          required={requireSelection}
          value={effectiveDistrict}
          onChange={(event) => {
            markReplacement();
            setSelectedDistrict(event.target.value);
            onChange({ city: "", area: "", pincode: "", ...clearCoordinates });
          }}
          className={selectCls}
          disabled={!controlsValue.state || districtOptions.length === 0}
        >
          <option value="">{controlsValue.state ? "Select district" : "Select state first"}</option>
          {districtOptions.map((district) => (
            <option key={district.key} value={district.key}>{district.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">
          City / Taluk <span className="font-normal text-muted-foreground">(directory label)</span>
        </label>
        <p className="mb-1 text-[11px] text-muted-foreground">
          Directory labels may represent a city or taluk; this is not an assertion of an exact city boundary.
        </p>
        <select
          required={requireSelection}
          value={controlsValue.city}
          onChange={(event) => {
            markReplacement();
            onChange({ city: event.target.value, area: "", pincode: "", ...clearCoordinates });
          }}
          className={selectCls}
          disabled={!effectiveDistrict || cities.length === 0}
        >
          <option value="">{effectiveDistrict ? "Select city / taluk" : "Select district first"}</option>
          {cities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">Area</label>
        <select
          required={requireSelection}
          value={controlsValue.area}
          onChange={(event) => {
            markReplacement();
            const areaRows = rowsForCity.filter(
              (location) => normalized(location.area) === normalized(event.target.value),
            );
            const areaPins = [...new Map(
              areaRows.map((location) => [normalized(location.pincode), location] as const),
            ).values()];
            const singlePin = areaPins.length === 1 ? areaPins[0] : undefined;
            onChange({
              area: event.target.value,
              pincode: singlePin?.pincode ?? "",
              ...coordinatesForRow(singlePin),
            });
          }}
          className={selectCls}
          disabled={!controlsValue.city || areas.length === 0}
        >
          <option value="">{controlsValue.city ? "Select area" : "Select city / taluk first"}</option>
          {areas.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-secondary mb-1 block">PIN code</label>
        {pinOptions.length > 1 ? (
          <select
            required={requireSelection}
            value={controlsValue.pincode}
            onChange={(event) => {
              markReplacement();
              const selected = pinOptions.find(
                (location) => normalized(location.pincode) === normalized(event.target.value),
              );
              onChange({
                pincode: event.target.value,
                ...coordinatesForRow(selected),
              });
            }}
            className={selectCls}
            disabled={!controlsValue.area}
          >
            <option value="">{controlsValue.area ? "Select PIN code" : "Select area first"}</option>
            {pinOptions.map((location) => (
              <option key={location.pincode} value={location.pincode}>{location.pincode}</option>
            ))}
          </select>
        ) : (
          <Input
            required={requireSelection}
            value={selectedPinRow?.pincode ?? ""}
            placeholder={controlsValue.area ? "Selected from approved directory" : "Select area first"}
            readOnly
            className="bg-muted"
          />
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          PIN code is selected exactly from the approved directory; it cannot be entered manually.
        </p>
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Latitude</label>
          <Input
            type="number"
            step="any"
            value={value.latitude}
            placeholder="e.g. 19.076090"
            onChange={(event) => onChange({ latitude: event.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-secondary mb-1 block">Longitude</label>
          <Input
            type="number"
            step="any"
            value={value.longitude}
            placeholder="e.g. 72.877426"
            onChange={(event) => onChange({ longitude: event.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Button type="button" variant="outline" className="gap-2" onClick={useCurrentLocation} disabled={locating}>
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            Use my current location
          </Button>
        </div>
      </div>
    </>
  );
}
