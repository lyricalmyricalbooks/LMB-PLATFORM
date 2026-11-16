// A shipping zone as its own form page (v4 form kit). The owner taps a quick pick, searches, or opens the place list;
// the zone names itself from what is picked; a new zone can take its first price here. Picks: zonePlaces.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "../riso/components";
import { FormField, FormPage, FormRow, FormSection, StatusBar, SummaryRail } from "../riso/FormKit";
import { CONTINENTS, type Continent } from "../../features/site/shippingZones";
import {
  applyQuickPick, continentState, countriesOf, countryState, findPlaces, hasStates, isEmpty, pickedChips, picksOf,
  placeCount, quickPicks, regionCount, regionState, setAllRegions, statesOf, suggestName, takenBy, toggleContinent, toggleCountry,
  toggleRegion, everywhereElse, zoneFromPicks, type Picks, type Tri, type ZoneIn,
} from "./zonePlaces";
import type { RegionCountry } from "./zoneRegions";
import "./zonePage.css";

export type FirstRate = { name: string; type: "flat"; base: number; additional: number; enabled: true };

type Zone = ZoneIn & { id: string; rates?: unknown[] };

/** A checkbox that can show "some" (a dash) as well as on and off. */
function TriBox({ state, label, disabled, onChange }: { state: Tri; label: string; disabled?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return (
    <input ref={ref} type="checkbox" className="zp-box" aria-label={label} checked={state === "all"} disabled={disabled}
      aria-checked={state === "some" ? "mixed" : state === "all"} onChange={onChange} />
  );
}

/** Canada and the United States sit above the continents, each opening to its provinces or states. */
const TOP = [{ code: "CA", name: "Canada" }, { code: "US", name: "United States" }];
const TOP_CODES = new Set(TOP.map((c) => c.code));

const money = (v: string) => { const n = Number(v); return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };

export function ZonePage({ zone, otherZones, home, isNew, profileName, presetEverywhereElse, onSave, onCancel }: {
  zone: Zone;
  /** The profile's other zones: a place one of them holds shows its name instead. */
  otherZones: ZoneIn[];
  home: RegionCountry;
  isNew: boolean;
  profileName: string;
  /** Opened from "Add Everywhere else" on the profile. */
  presetEverywhereElse?: boolean;
  onSave: (zone: Zone, firstRate: FirstRate | null) => void;
  onCancel: () => void;
}) {
  const taken = useMemo(() => takenBy(otherZones), [otherZones]);
  const [picks, setPicks] = useState<Picks>(() => (presetEverywhereElse ? everywhereElse(true) : picksOf(zone)));
  const [name, setName] = useState(() => (isNew ? "" : String(zone.name || "")));
  const [nameTouched, setNameTouched] = useState(!isNew && !!String(zone.name || "").trim());
  const [query, setQuery] = useState("");
  const [base, setBase] = useState("");
  const [extra, setExtra] = useState("");
  const homeContinent: Continent = "North America";
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>([homeContinent, "states-CA", "states-US"]);
    const p = presetEverywhereElse ? everywhereElse(true) : picksOf(zone);
    for (const c of CONTINENTS) if (continentState(p, c, taken).state !== "none") s.add(c);
    for (const r of p.regions) s.add(`states-${r.split("-")[0]}`);
    return s;
  });
  const flip = (key: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const suggested = suggestName(picks, taken);
  const shownName = nameTouched ? name : suggested;
  const finalName = shownName.trim() || suggested;
  const legacyOnly = isEmpty(picks) && !!String(zone.region || "").trim();
  const nothing = isEmpty(picks) && !legacyOnly;
  const chips = pickedChips(picks, taken);
  const hits = useMemo(() => findPlaces(query, 12), [query]);
  const quick = quickPicks(picks, home, taken);
  const firstBase = money(base);

  const save = () => {
    const saved = zoneFromPicks(zone, picks, finalName);
    onSave(saved, isNew && firstBase != null
      ? { name: "Standard shipping", type: "flat", base: firstBase, additional: money(extra) ?? 0, enabled: true } : null);
  };

  const countryRow = (code: string, label: string) => {
    const state = countryState(picks, code);
    const heldBy = taken.countries.get(code);
    const states = hasStates(code);
    const statesOpen = open.has(`states-${code}`);
    const count = states ? regionCount(picks, code) : null;
    return (
      <li key={code} className="zp-row" data-on={state !== "none" ? "" : undefined}>
        <label className="zp-row-main">
          <TriBox state={state} label={label} disabled={!!heldBy && !states} onChange={() => setPicks((p) => toggleCountry(p, code, taken))} />
          <span className="zp-row-name">{label}</span>
          {heldBy && <span className="zp-held">In {heldBy}</span>}
          {count && state === "some" && <span className="zp-count">{count.on} of {count.of}</span>}
        </label>
        {states && (
          <button type="button" className="zp-more" aria-expanded={statesOpen} onClick={() => flip(`states-${code}`)}>
            {code === "CA" ? "Provinces" : "States"}
          </button>
        )}
        {states && statesOpen && (<>
          <div className="zp-states-bar">
            <button type="button" className="zp-more" disabled={state === "all" || (!!count && count.on === count.of)}
              onClick={() => setPicks((p) => setAllRegions(p, code, true, taken))}>Select all</button>
            <button type="button" className="zp-more" disabled={state === "none"}
              onClick={() => setPicks((p) => setAllRegions(p, code, false, taken))}>Clear</button>
          </div>
          <ul className="zp-states" aria-label={`${code === "CA" ? "Provinces" : "States"} in ${label}`}>
            {statesOf(code).map((s) => {
              const held = taken.regions.get(s.code);
              const on = regionState(picks, s.code);
              return (
                <li key={s.code} data-on={on ? "" : undefined}>
                  <label>
                    <input type="checkbox" className="zp-box" checked={on} disabled={!!held && !on}
                      onChange={() => setPicks((p) => toggleRegion(p, s.code, taken))} />
                    <span>{s.name}</span>
                    {held && <span className="zp-held">In {held}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>)}
      </li>
    );
  };

  return (
    <div className="rp-stack">
      <PageHead title={finalName || (isNew ? "New zone" : "Zone")} description={`Shipping zone · ${profileName}`}
        back={{ label: profileName || "Profile", onClick: onCancel }} />
      <FormPage rail={
        <SummaryRail tone="mint" title="This zone"
          value={picks.restOfWorld ? "Everywhere else" : legacyOnly ? String(zone.region) : `${placeCount(picks)} ${placeCount(picks) === 1 ? "place" : "places"}`}
          sub={picks.restOfWorld ? "Every place your other zones leave out." : finalName || "Pick where it ships"}
          rows={[
            ...(isNew && firstBase != null ? [{ label: "Standard shipping", value: `$${firstBase.toFixed(2)}` }] : []),
            ...(!isNew ? [{ label: "Rates", value: String((zone.rates || []).length) }] : []),
          ]} />
      }>
        <FormSection title="Where it ships" description="Tap a quick pick, search, or open the list.">
          <div className="zp-quick" role="group" aria-label="Quick picks">
            {quick.map((q) => (
              <button key={q.id} type="button" className="zp-pill" data-state={q.state} aria-pressed={q.state === "all"}
                disabled={!!q.disabled && q.state === "none"} title={q.disabled ? `In ${q.disabled}` : undefined}
                onClick={() => setPicks((p) => applyQuickPick(p, q.id, home, taken))}>
                {q.state === "all" && <span aria-hidden>✓ </span>}{q.label}
              </button>
            ))}
          </div>
          {quick.some((q) => q.disabled && q.state === "none") && <p className="zp-note">Greyed out means another zone already has it.</p>}

          <div className="zp-tray" aria-live="polite">
            {chips.length === 0 ? (
              <p className="zp-empty">{legacyOnly ? `Saved as “${zone.region}”. Pick places to replace it.` : "Nothing picked yet."}</p>
            ) : (
              <ul className="zp-chips" aria-label="In this zone">
                {chips.map((c) => (
                  <li key={c.key} className="zp-chip">
                    <span>{c.label}</span>
                    <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setPicks((p) => c.remove(p))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!picks.restOfWorld && (<>
            <div className="zp-search">
              <input type="search" className="zp-search-input" aria-label="Find a country, state or province" placeholder="Find a country, state or province"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {query.trim() && (
                hits.length === 0 ? <p className="zp-empty">No place called “{query.trim()}”.</p> : (
                  <ul className="zp-hits" aria-label="Places found">
                    {hits.map((h) => {
                      const on = h.kind === "country" ? countryState(picks, h.code) === "all" : regionState(picks, h.code);
                      const held = h.kind === "country" ? taken.countries.get(h.code) : taken.regions.get(h.code);
                      const blocked = !!held && !on && !(h.kind === "country" && hasStates(h.code));
                      return (
                        <li key={h.code}>
                          <button type="button" className="zp-hit" aria-pressed={on} disabled={blocked}
                            onClick={() => setPicks((p) => (h.kind === "country" ? toggleCountry(p, h.code, taken) : toggleRegion(p, h.code, taken)))}>
                            <span className="zp-hit-tick" aria-hidden>{on ? "✓" : "+"}</span>
                            <span className="zp-row-name">{h.name}</span>
                            <span className="zp-held">{held ? `In ${held}` : h.kind === "region" ? h.country : ""}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </div>

            <ul className="zp-countries zp-top" aria-label="Canada and the United States">
              {TOP.map((c) => countryRow(c.code, c.name))}
            </ul>

            <ul className="zp-tree" aria-label="All places">
              {CONTINENTS.map((cont) => {
                const s = continentState(picks, cont, taken);
                const isOpen = open.has(cont);
                return (
                  <li key={cont} className="zp-cont" data-open={isOpen ? "" : undefined}>
                    <div className="zp-cont-head">
                      <label className="zp-row-main">
                        <TriBox state={s.state} label={`All of ${cont}`} disabled={s.of === 0} onChange={() => setPicks((p) => toggleContinent(p, cont, taken))} />
                        <span className="zp-cont-name">{cont}</span>
                      </label>
                      <span className="zp-count">{s.on ? `${s.on} of ${s.of}` : `${countriesOf(cont).length}`}</span>
                      <button type="button" className="zp-more" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} countries in ${cont}`} onClick={() => flip(cont)}>
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    </div>
                    {isOpen && <ul className="zp-countries">{countriesOf(cont).filter((c) => !TOP_CODES.has(c.code)).map((c) => countryRow(c.code, c.name))}</ul>}
                  </li>
                );
              })}
            </ul>
          </>)}
        </FormSection>

        <FormSection title="Name" description="Only you see it. Shoppers see rate names.">
          <FormField label="Zone name" hint={nameTouched && suggested && name.trim() !== suggested ? `Suggested: ${suggested}` : undefined}>
            {(a) => <input {...a} value={shownName} placeholder={suggested || "e.g. Close to home"}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }} />}
          </FormField>
        </FormSection>

        {isNew && (
          <FormSection title="First price" description="Optional. You can add more rates after.">
            <FormRow>
              <FormField label="Per order" prefix="$" hint="Leave empty to add rates later.">
                {(a) => <input {...a} type="number" min={0} step="0.01" inputMode="decimal" placeholder="12.00" value={base} onChange={(e) => setBase(e.target.value)} />}
              </FormField>
              <FormField label="Each extra item" prefix="$">
                {(a) => <input {...a} type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={extra} onChange={(e) => setExtra(e.target.value)} />}
              </FormField>
            </FormRow>
          </FormSection>
        )}
      </FormPage>
      <StatusBar status={nothing ? { tone: "warn", text: "Pick at least one place" } : { tone: isNew ? "good" : "warn", text: isNew ? "Ready to add" : "Unsaved changes" }}
        primaryLabel={isNew ? "Add zone" : "Save zone"} blocked={nothing} onBlocked={() => document.querySelector<HTMLElement>(".zp-pill")?.focus()}
        onPrimary={save} onCancel={onCancel} />
    </div>
  );
}
