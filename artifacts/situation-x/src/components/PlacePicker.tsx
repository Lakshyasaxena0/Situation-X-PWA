import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLACES, validCoords } from "@/lib/places";
import type { SavedPlace } from "@/lib/settings";
import { Crosshair } from "lucide-react";

const CUSTOM = "__custom__";

/** Choose a city, use the device location, or type coordinates. */
export function PlacePicker({ value, onChange, idPrefix }: { value: SavedPlace | null; onChange: (p: SavedPlace) => void; idPrefix: string }) {
  const known = value ? PLACES.find((p) => p.name === value.name) : undefined;
  const [custom, setCustom] = useState(Boolean(value && !known));
  const [lat, setLat] = useState(value ? String(value.latitude) : "");
  const [lon, setLon] = useState(value ? String(value.longitude) : "");
  const [note, setNote] = useState("");

  function applyCustom(latText: string, lonText: string) {
    const la = Number(latText);
    const lo = Number(lonText);
    if (latText.trim() === "" || lonText.trim() === "" || !validCoords(la, lo)) {
      setNote("Enter latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    setNote("");
    onChange({ name: `Custom (${la.toFixed(2)}, ${lo.toFixed(2)})`, latitude: la, longitude: lo });
  }

  function useDevice() {
    if (!navigator.geolocation) {
      setNote("This browser cannot share its location. Pick a city instead.");
      return;
    }
    setNote("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = Number(pos.coords.latitude.toFixed(4));
        const lo = Number(pos.coords.longitude.toFixed(4));
        setCustom(true);
        setLat(String(la));
        setLon(String(lo));
        setNote("Using your current location.");
        onChange({ name: `My location (${la.toFixed(2)}, ${lo.toFixed(2)})`, latitude: la, longitude: lo });
      },
      () => setNote("Could not get your location (permission denied or unavailable). Pick a city instead."),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select
          id={`${idPrefix}-place`}
          aria-label="City"
          className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground min-w-[12rem]"
          value={custom ? CUSTOM : (known?.name ?? "")}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              return;
            }
            const p = PLACES.find((x) => x.name === e.target.value);
            if (p) {
              setCustom(false);
              setNote("");
              onChange(p);
            }
          }}
        >
          {!value && <option value="">Choose a city...</option>}
          {PLACES.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
          <option value={CUSTOM}>Other: type coordinates...</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={useDevice}>
          <Crosshair className="w-3.5 h-3.5 mr-1.5" /> Use my current location
        </Button>
      </div>
      {custom && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input aria-label="Latitude" inputMode="decimal" placeholder="Latitude e.g. 28.61" className="w-40 h-9" value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => applyCustom(lat, lon)} />
          <Input aria-label="Longitude" inputMode="decimal" placeholder="Longitude e.g. 77.21" className="w-40 h-9" value={lon} onChange={(e) => setLon(e.target.value)} onBlur={() => applyCustom(lat, lon)} />
          <Button type="button" size="sm" variant="secondary" onClick={() => applyCustom(lat, lon)}>
            Save
          </Button>
        </div>
      )}
      {value && <p className="text-xs text-muted-foreground">Saved: {value.name} &middot; lat {value.latitude.toFixed(2)}, lon {value.longitude.toFixed(2)}</p>}
      {note && <p className="text-xs text-muted-foreground" aria-live="polite">{note}</p>}
    </div>
  );
}
