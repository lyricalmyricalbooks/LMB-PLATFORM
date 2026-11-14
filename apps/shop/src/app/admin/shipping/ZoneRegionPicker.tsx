// The zone editor's "States and provinces" block: pick US states or Canadian provinces for one zone. A state or
// province here wins over its whole country in another zone at checkout (src/shared/shippingZones.ts).
import { useMemo, useState } from "react";
import { Checkbox, GhostButton, SearchField, Tabs } from "../riso/components";
import { regionList } from "../../features/site/shippingZones";
import {
  REGION_GROUPS, groupState, regionNoun, toggleGroup, toggleRegion, type RegionCountry, type ZoneWithRegions,
} from "./zoneRegions";
import "./zoneRegions.css";

type ZoneLike = ZoneWithRegions & { name?: string };

export default function ZoneRegionPicker({ regions, onChange, otherZones, homeCountry }: {
  regions: string[];
  onChange: (next: string[]) => void;
  /** The profile's other zones, so a state already priced elsewhere can't be picked twice. */
  otherZones: ZoneLike[];
  /** "US" or "CA" opens that list first. */
  homeCountry?: string | null;
}) {
  const [country, setCountry] = useState<RegionCountry>(homeCountry === "CA" ? "CA" : homeCountry === "US" ? "US" : (regions[0]?.startsWith("CA-") ? "CA" : "US"));
  const [search, setSearch] = useState("");
  const takenBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of otherZones) for (const code of z.regions || []) map.set(String(code), z.name || "another zone");
    return map;
  }, [otherZones]);
  const taken = useMemo(() => new Set(takenBy.keys()), [takenBy]);
  const list = regionList(country);
  const q = search.trim().toLowerCase();
  const shown = q ? list.filter(([code, name]) => name.toLowerCase().includes(q) || code.toLowerCase() === q) : list;
  const count = (cc: RegionCountry) => regions.filter((r) => r.startsWith(`${cc}-`)).length;
  const picked = count(country);

  return (
    <section className="zr" aria-labelledby="zr-title">
      <div className="zr-head">
        <h3 id="zr-title" className="zr-title">States and provinces</h3>
        <p className="zr-hint">Charge a state or province its own price. It wins over its country in another zone.</p>
      </div>
      <Tabs label="Country" idPrefix="zr-" value={country} onChange={(id) => { setCountry(id); setSearch(""); }}
        tabs={[{ id: "US", label: "United States", count: count("US") }, { id: "CA", label: "Canada", count: count("CA") }]} />
      <div className="zr-groups" role="group" aria-label={`Quick picks for ${country === "CA" ? "Canada" : "the United States"}`}>
        {REGION_GROUPS[country].map((g) => {
          const state = groupState(regions, country, g.codes, taken);
          return (
            <button key={g.id} type="button" className="zr-chip" data-state={state} aria-pressed={state === "all"}
              onClick={() => onChange(toggleGroup(regions, country, g.codes, taken))}>
              {state === "all" ? "✓ " : "+ "}{g.label}
            </button>
          );
        })}
      </div>
      {list.length > 15 && (
        <SearchField label={`Find a ${regionNoun(country)}`} placeholder={`Find a ${regionNoun(country)}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      <div className="zr-grid">
        {shown.map(([code, name]) => {
          const full = `${country}-${code}`;
          const elsewhere = takenBy.get(full);
          return (
            <div key={full} className="zr-cell" data-on={regions.includes(full) || undefined} data-taken={elsewhere ? "" : undefined}>
              <Checkbox label={elsewhere ? `${name} · in ${elsewhere}` : name} checked={regions.includes(full)} disabled={!!elsewhere}
                onChange={() => onChange(toggleRegion(regions, full))} />
            </div>
          );
        })}
        {shown.length === 0 && <p className="zr-hint">No {regionNoun(country, true)} match “{search}”.</p>}
      </div>
      <div className="zr-foot">
        <p className="zr-hint" role="status">{picked === 0 ? `No ${regionNoun(country, true)} picked` : `${picked} ${picked === 1 ? regionNoun(country) : regionNoun(country, true)} picked`}</p>
        {picked > 0 && <GhostButton size="sm" onClick={() => onChange(regions.filter((r) => !r.startsWith(`${country}-`)))}>Clear</GhostButton>}
      </div>
    </section>
  );
}
