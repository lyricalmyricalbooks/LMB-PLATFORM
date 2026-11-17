// Settings › Shipping › Profiles: one workspace (Julian's "Shipping Profiles v2" mockup). Pick a profile on the left;
// on the right choose its books, where it ships and the price, and try what a customer pays. Every edit is a draft until
// the Save bar publishes it.
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Dialog } from "../riso/components";
import { useShopWords } from "../shopWords";
import { useSettingsDirty } from "../settingsDirty";
import { SHOP_COUNTRY } from "../moneySign";
import { starterPrices, buildNewProfile, copyZones, type ProfileStarterId, type QuickZonePrice } from "../shippingProfileStarters";
import { CONTINENTS, findCountry, type Continent } from "../../features/site/shippingZones";
import {
  applyQuickPick, continentState, countriesOf, countryState, pickedChips, picksOf, quickPicks, regionCount, regionState,
  setAllRegions, statesOf, suggestName, takenBy, toggleContinent, toggleCountry, toggleRegion, zoneFromPicks, zoneSummary,
  lacksEverywhereElse, everywhereElse, type Picks,
} from "./zonePlaces";
import { GENERAL, cleanProfile, nameProblem, profileHasProblems, savePlan, tryIt, withRate, zoneProblems, zoneRate } from "./profilesWorkspace";
import "./profilesWorkspace.css";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const home = (SHOP_COUNTRY === "US" ? "US" : "CA") as "CA" | "US";
const bookMap = (books: any[]) => Object.fromEntries(books.map((b) => [b.id, b.shippingProfileId || GENERAL]));
const kindOf = (b: any) => String(b.format || b.kind || b.type || "item").toLowerCase();

const DESTINATIONS: [string, string][] = [
  ["CA-ON", "Canada"], ["CA-YT", "Canada · Yukon"], ["US-NY", "United States"], ["GB", "United Kingdom"],
  ["DE", "Germany"], ["AU", "Australia"], ["JP", "Japan"], ["BR", "Brazil"],
];
const SAMPLE_PRICE = 24;

export function ProfilesWorkspace({ profiles, books, refreshProfiles, reloadBooks, focusProfileId }: {
  profiles: any[]; books: any[]; refreshProfiles: () => Promise<any> | void; reloadBooks: () => Promise<any> | void; focusProfileId?: string | null;
}) {
  const w = useShopWords();
  const [draft, setDraft] = useState<any[]>(() => clone(profiles));
  const [assign, setAssign] = useState<Record<string, string>>(() => bookMap(books));
  const [selected, setSelected] = useState<string>(focusProfileId || profiles[0]?.id || GENERAL);
  const [bookPicker, setBookPicker] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<"all" | "general" | "here">("all");
  const [pickingZone, setPickingZone] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [dest, setDest] = useState(DESTINATIONS[0][0]);
  const [cart, setCart] = useState(1);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);

  // A fresh load from the store replaces the draft (after Save, or the first time the lists arrive).
  const savedKey = JSON.stringify(profiles) + JSON.stringify(bookMap(books));
  const lastKey = useRef(savedKey);
  useEffect(() => {
    if (lastKey.current === savedKey) return;
    lastKey.current = savedKey;
    setDraft(clone(profiles));
    setAssign(bookMap(books));
  }, [savedKey]);
  useEffect(() => { if (focusProfileId) setSelected(focusProfileId); }, [focusProfileId]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(profiles) || JSON.stringify(assign) !== JSON.stringify(bookMap(books));
  useSettingsDirty("shipping-profiles", dirty);

  const profile = draft.find((p) => p.id === selected) || draft[0];
  const nameOfProfile = (id: string) => draft.find((p) => p.id === id)?.name || "General";
  const booksOn = (id: string) => books.filter((b) => assign[b.id] === id);
  const isGeneral = profile?.id === GENERAL;

  const select = (id: string) => { setSelected(id); setBookPicker(false); setPickingZone(null); };
  const patch = (fn: (p: any) => any) => setDraft((all) => all.map((p) => (p.id === profile.id ? fn(p) : p)));
  const patchZone = (zid: string, fn: (z: any) => any) => patch((p) => ({ ...p, zones: (p.zones || []).map((z: any) => (z.id === zid ? fn(z) : z)) }));

  const discard = () => { setDraft(clone(profiles)); setAssign(bookMap(books)); setTriedSave(false); setPickingZone(null); if (!profiles.some((p) => p.id === selected)) setSelected(GENERAL); };

  const save = async () => {
    if (saving) return;
    if (draft.some(profileHasProblems)) { setTriedSave(true); toast.error("Finish the zones marked in red first."); return; }
    setSaving(true);
    try {
      const plan = savePlan(profiles, draft, bookMap(books), assign);
      const ids = new Map<string, string>();
      for (const p of plan.create) { const { id: _temp, ...rest } = cleanProfile(p); ids.set(p.id, (await adminApi.createShippingProfile(rest)).id); }
      for (const id of plan.remove) await adminApi.deleteShippingProfile(id);
      for (const p of plan.update) await adminApi.updateShippingProfile(p.id, cleanProfile(p));
      for (const a of plan.assign) await adminApi.assignProductsToShippingProfile(ids.get(a.profileId) || a.profileId, a.add, a.removed);
      if (ids.has(selected)) setSelected(ids.get(selected)!);
      setTriedSave(false);
      await Promise.all([refreshProfiles(), reloadBooks()]);
      toast.success("Shipping saved. Customers see the new prices now.");
    } catch {
      toast.error("Couldn't save everything. Check your connection and press Save again.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const names = draft.map((p) => p.name);
    let name = `${profile.name} (copy)`; let n = 2;
    while (names.includes(name)) name = `${profile.name} (copy ${n++})`;
    const copy = { ...clone(profile), id: `new-${newId()}`, name, zones: copyZones(profile.zones, newId) };
    setDraft((all) => [...all, copy]);
    select(copy.id);
    toast.success(`Copied as “${name}”.`);
  };
  const remove = () => {
    if (isGeneral) return;
    const moved = booksOn(profile.id).length;
    setAssign((a) => Object.fromEntries(Object.entries(a).map(([b, p]) => [b, p === profile.id ? GENERAL : p])));
    setDraft((all) => all.filter((p) => p.id !== profile.id));
    select(GENERAL);
    toast.success(w(`Deleted. Its ${moved} book${moved === 1 ? "" : "s"} moved to General.`));
  };

  const addZone = (rest = false) => {
    const z = { id: newId(), name: rest ? "Everywhere else" : "New zone", countries: [], continents: [], regions: [], restOfWorld: rest,
      rates: [{ id: newId(), name: "Standard shipping", type: "flat", enabled: true, base: "", additional: "", deliveryDays: "", minPrice: null, maxPrice: null }] };
    patch((p) => ({ ...p, zones: [...(p.zones || []), z] }));
    if (!rest) setPickingZone(z.id);
  };

  if (!profile) return null;
  const zones = profile.zones || [];
  const here = booksOn(profile.id);
  const q = bookQuery.trim().toLowerCase();
  const pickerBooks = books.filter((b) => (!q || String(b.title || "").toLowerCase().includes(q))
    && (bookFilter === "all" || (bookFilter === "general" ? assign[b.id] === GENERAL : assign[b.id] === profile.id)));
  const result = tryIt(profile, dest, cart, SAMPLE_PRICE);

  return (
    <div className="spw">
      <aside className="spw-rail" aria-label="Shipping profiles">
        <div className="spw-railhead">
          <span className="spw-mono">Profiles</span>
        </div>
        <div className="spw-strip">
        {draft.map((p) => {
          const zs = p.zones || [];
          const n = booksOn(p.id).length;
          return (
            <button key={p.id} type="button" className="spw-prof" aria-current={p.id === profile.id} onClick={() => select(p.id)}>
              <b>{p.name || "Untitled profile"}{(zs.length === 0 || lacksEverywhereElse(zs)) && <i className="spw-dot" aria-label="Some customers can't buy" />}</b>
              <small>{w(`${n} book${n === 1 ? "" : "s"}`)}{p.id === GENERAL ? " · default" : ""}</small>
              <span>{zs.length ? zs.slice(0, 3).map((z: any) => z.name || "Zone").join(", ") + (zs.length > 3 ? ` · +${zs.length - 3}` : "") : "Ships nowhere yet"}</span>
            </button>
          );
        })}
        <button type="button" className="spw-newcard" onClick={() => setWizard(true)}>+ New profile</button>
        </div>
        <p className="spw-foot">{w("Every book is on exactly one profile. Books you haven't moved use General.")}</p>
      </aside>

      <div className="spw-main">
        <section className="spw-card" aria-label="Profile">
          <div className="spw-head">
            <input className="spw-name" aria-label="Profile name" value={profile.name || ""} onChange={(e) => patch((p) => ({ ...p, name: e.target.value }))} />
            <button type="button" className="spw-pill soft" onClick={duplicate}>Duplicate</button>
            {!isGeneral && <button type="button" className="spw-pill danger" onClick={remove}>Delete</button>}
          </div>
        </section>

        <section className="spw-card" aria-labelledby="spw-books">
          <div className="spw-title">
            <div><h2 id="spw-books">{w("1 · Books on this profile")}</h2><p>{isGeneral ? w(`${here.length} book${here.length === 1 ? "" : "s"} use General, the default.`) : w(`${here.length} book${here.length === 1 ? "" : "s"} ship with these prices.`)}</p></div>
            <button type="button" className="spw-pill ink" aria-expanded={bookPicker} onClick={() => setBookPicker((o) => !o)}>{bookPicker ? "Done" : w("Assign books")}</button>
          </div>
          {here.length === 0 ? (
            <div className="spw-empty">{w("No books use this profile yet. Press Assign books to move some here.")}</div>
          ) : (
            <div className="spw-chips">
              {here.map((b) => (
                <span key={b.id} className="spw-chip">{b.title || "Untitled"}
                  <button type="button" aria-label={`Move ${b.title} to General`} onClick={() => {
                    if (isGeneral) { toast(w("Every book needs a profile. Move it by assigning it to another one.")); return; }
                    setAssign((a) => ({ ...a, [b.id]: GENERAL }));
                  }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {bookPicker && (
            <div className="spw-panel">
              <input type="search" aria-label={w("Find a book")} placeholder={w("Find a book")} value={bookQuery} onChange={(e) => setBookQuery(e.target.value)} />
              <div className="spw-chips" role="group" aria-label="Show">
                {([["all", w("All books")], ["general", "On General"], ["here", "On this profile"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className="spw-filter" aria-pressed={bookFilter === k} onClick={() => setBookFilter(k)}>{label}</button>
                ))}
              </div>
              <div className="spw-books">
                {pickerBooks.map((b) => {
                  const on = assign[b.id] === profile.id;
                  return (
                    <label key={b.id} className={`spw-book${on ? " on" : ""}`}>
                      <input type="checkbox" checked={on} disabled={isGeneral && on} onChange={() => setAssign((a) => ({ ...a, [b.id]: on ? GENERAL : profile.id }))} />
                      <span><b>{b.title || "Untitled"}</b><small>{kindOf(b)} · {nameOfProfile(assign[b.id])}</small></span>
                    </label>
                  );
                })}
                {pickerBooks.length === 0 && <p className="spw-note">{w("No books match.")}</p>}
              </div>
              <p className="spw-note">Nothing is saved until you press Save.</p>
            </div>
          )}
        </section>

        <section className="spw-card" aria-labelledby="spw-zones">
          <div className="spw-title">
            <div><h2 id="spw-zones">{w("2 · Where these books ship, and the price")}</h2></div>
            <button type="button" className="spw-pill ink" onClick={() => addZone()}>+ Add zone</button>
          </div>
          {(zones.length === 0 || lacksEverywhereElse(zones)) && (
            <div className="spw-gap">
              <div><b>{w("Some customers can't buy these books")}</b><p>Places no zone covers can't check out.</p></div>
              <button type="button" className="spw-pill ink" onClick={() => addZone(true)}>Add “Everywhere else”</button>
            </div>
          )}
          <div className="spw-zones">
          {zones.map((z: any) => (
            <ZoneCard key={z.id} zone={z} others={zones.filter((o: any) => o.id !== z.id)} picking={pickingZone === z.id} showProblems={triedSave}
              onPick={() => setPickingZone(pickingZone === z.id ? null : z.id)}
              onChange={(fn) => patchZone(z.id, fn)}
              onDelete={() => { patch((p) => ({ ...p, zones: p.zones.filter((x: any) => x.id !== z.id) })); if (pickingZone === z.id) setPickingZone(null); }} />
          ))}
          </div>
          <label className="spw-field" style={{ maxWidth: 240 }}>Free shipping over ($)
            <input inputMode="decimal" placeholder="Optional" value={profile.freeShippingOver ?? ""} onChange={(e) => patch((p) => ({ ...p, freeShippingOver: e.target.value }))} />
          </label>
        </section>

        <section className="spw-card spw-try" aria-labelledby="spw-try">
          <div className="spw-title"><div><h2 id="spw-try">3 · Try it</h2><p>What a customer pays, with your unsaved changes.</p></div></div>
          <div className="spw-chips" role="group" aria-label="Customer in">
            {DESTINATIONS.map(([code, label]) => <button key={code} type="button" className="spw-filter" aria-pressed={dest === code} onClick={() => setDest(code)}>{label}</button>)}
          </div>
          <div className="spw-chips" role="group" aria-label={w("Books in cart")}>
            {[1, 2, 4].map((n) => <button key={n} type="button" className="spw-filter" aria-pressed={cart === n} onClick={() => setCart(n)}>{w(`${n} book${n === 1 ? "" : "s"}`)}</button>)}
          </div>
          {result.ok ? (
            <div className="spw-result" role="status">
              <span><b>{result.zone}{result.days ? ` · ${result.days} days` : ""}</b><small>{result.line}</small></span>
              <strong>${result.price.toFixed(2)}</strong>
            </div>
          ) : (
            <div className="spw-result no" role="status"><span><b>Can't check out</b><small>No zone covers this place.</small></span></div>
          )}
        </section>
      </div>

      {dirty && (
        <div className="spw-savebar" role="region" aria-label="Unsaved shipping changes">
          <span>Unsaved shipping changes</span>
          <button type="button" className="spw-pill ghost" onClick={discard} disabled={saving}>Discard</button>
          <button type="button" className="spw-pill light" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      )}

      <NewProfileWizard open={wizard} onClose={() => setWizard(false)} profiles={draft} books={books} assign={assign}
        onCreate={(p, bookIds) => {
          setDraft((all) => [...all, p]);
          setAssign((a) => ({ ...a, ...Object.fromEntries(bookIds.map((b) => [b, p.id])) }));
          setWizard(false);
          select(p.id);
          toast.success(`“${p.name}” is ready. Press Save to publish it.`);
        }} />
    </div>
  );
}

/* ── One zone: name, places (with the picker inside), price ─────────── */

function ZoneCard({ zone, others, picking, showProblems, onPick, onChange, onDelete }: {
  zone: any; others: any[]; picking: boolean; showProblems: boolean; onPick: () => void; onChange: (fn: (z: any) => any) => void; onDelete: () => void;
}) {
  const w = useShopWords();
  const taken = useMemo(() => takenBy(others), [others]);
  const picks = picksOf(zone);
  const rate = zoneRate(zone) || {};
  const flat = (rate.type || "flat") === "flat";
  const problems = zoneProblems(zone);
  const setPicks = (p: Picks) => onChange((z) => {
    const firstPlace = picksOf(z).countries.length + picksOf(z).regions.length === 0 && !z.restOfWorld;
    const name = firstPlace && (!String(z.name || "").trim() || z.name === "New zone") ? suggestName(p, taken) || z.name : z.name;
    return zoneFromPicks(z, p, name);
  });
  const setRate = (k: string, v: string) => onChange((z) => withRate(z, { [k]: v }, newId));

  return (
    <div className="spw-zone">
      <div className="spw-zonehead">
        <input className="spw-zonename" aria-label="Zone name" value={zone.name || ""} onChange={(e) => onChange((z) => ({ ...z, name: e.target.value }))} />
        <button type="button" className="spw-del" onClick={onDelete}>Delete zone</button>
      </div>
      <div className="spw-chips">
        {pickedChips(picks, taken).map((c) => (
          <span key={c.key} className="spw-chip white">{c.label}
            <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setPicks(c.remove(picks))}>✕</button>
          </span>
        ))}
        {zone.restOfWorld && pickedChips(picks).length === 0 && <span className="spw-chip white">Everywhere else</span>}
        <button type="button" className="spw-chip dashed" aria-expanded={picking} onClick={onPick}>{picking ? "Done" : "+ Add places"}</button>
      </div>
      {picking && <PlacePicker picks={picks} taken={taken} onChange={setPicks} />}
      {showProblems && problems.includes("places") && <p className="spw-bad">Pick at least one place for this zone.</p>}
      {flat ? (
        <div className="spw-prices">
          <label className="spw-field">{w("First book ($)")}<input inputMode="decimal" value={rate.base ?? ""} onChange={(e) => setRate("base", e.target.value)} /></label>
          <label className="spw-field">{w("Each extra book ($)")}<input inputMode="decimal" value={rate.additional ?? ""} onChange={(e) => setRate("additional", e.target.value)} /></label>
          <label className="spw-field">Delivery days<input value={rate.deliveryDays ?? ""} placeholder="e.g. 3–5" onChange={(e) => setRate("deliveryDays", e.target.value)} /></label>
        </div>
      ) : (
        <p className="spw-note">This zone is priced by {rate.type === "weight" ? "weight" : "its own rule"}; that price stays as it is.</p>
      )}
      {showProblems && problems.includes("price") && <p className="spw-bad">{w("Enter the first-book price (0 for free).")}</p>}
    </div>
  );
}

/* ── The place picker: quick picks, continents, countries, then provinces and states ── */

function Tile({ label, state, note, onClick }: { label: string; state: "all" | "some" | "none"; note?: string; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={state === "all" ? true : state === "some" ? "mixed" : false} aria-disabled={note ? true : undefined}
      className={`spw-tile${state === "all" ? " on" : state === "some" ? " some" : ""}`}
      onClick={() => (note ? toast(`${label} is already in ${note}.`) : onClick())}>
      <span className="tick" aria-hidden="true">{state === "all" ? "✓" : state === "some" ? "–" : ""}</span>
      <span className="lbl">{label}{note && <em> · in {note}</em>}</span>
    </button>
  );
}

function PlacePicker({ picks, taken, onChange }: { picks: Picks; taken: ReturnType<typeof takenBy>; onChange: (p: Picks) => void }) {
  const [continent, setContinent] = useState<Continent>("North America");
  const [open, setOpen] = useState<string | null>(null);
  const cont = continentState(picks, continent, taken);
  return (
    <div className="spw-picker">
      <span className="spw-mono">Quick picks</span>
      <div className="spw-chips">
        {quickPicks(picks, home, taken).map((q) => (
          <button key={q.id} type="button" className="spw-filter" aria-pressed={q.state === "all"} disabled={!!q.disabled}
            title={q.disabled ? `Already in ${q.disabled}` : undefined}
            onClick={() => onChange(q.id === "rest" ? everywhereElse(!picks.restOfWorld) : applyQuickPick(picks, q.id, home, taken))}>{q.label}</button>
        ))}
      </div>
      <span className="spw-mono">Browse by continent</span>
      <div className="spw-chips">
        {CONTINENTS.map((c) => <button key={c} type="button" className="spw-filter" aria-pressed={continent === c} onClick={() => { setContinent(c); setOpen(null); }}>{c}</button>)}
      </div>
      <div className="spw-tiles">
        <Tile label={`All of ${continent}`} state={cont.state} note={cont.of === 0 ? "other zones" : undefined} onClick={() => onChange(toggleContinent(picks, continent, taken))} />
        {countriesOf(continent).map((c) => {
          const regions = statesOf(c.code);
          const note = taken.countries.get(c.code);
          const tile = <Tile label={c.name} state={countryState(picks, c.code)} note={note} onClick={() => onChange(toggleCountry(picks, c.code, taken))} />;
          if (!regions.length || (c.code !== "CA" && c.code !== "US")) return <div key={c.code}>{tile}</div>;
          const word = c.code === "CA" ? "Provinces" : "States";
          const count = regionCount(picks, c.code);
          const some = countryState(picks, c.code) === "some";
          return [
            <div key={c.code} className="spw-countrytile">{tile}
              {!note && <button type="button" className="spw-more" aria-expanded={open === c.code} onClick={() => setOpen(open === c.code ? null : c.code)}>
                {open === c.code ? "Hide" : some ? `${count.on} picked ▾` : `${word} ▾`}</button>}
            </div>,
            open === c.code && (
              <div key={`${c.code}-r`} className="spw-regions">
                <div className="spw-chips" style={{ justifyContent: "space-between" }}>
                  <span className="spw-mono">{word} of {findCountry(c.code)?.name}</span>
                  <span style={{ display: "flex", gap: 14 }}>
                    <button type="button" className="spw-link" onClick={() => onChange(setAllRegions(picks, c.code, true, taken))}>Select all</button>
                    <button type="button" className="spw-link" onClick={() => onChange(setAllRegions(picks, c.code, false, taken))}>Clear</button>
                  </span>
                </div>
                <div className="spw-tiles small">
                  {regions.map((r) => (
                    <Tile key={r.code} label={r.name} state={regionState(picks, r.code) ? "all" : "none"} note={taken.regions.get(r.code)}
                      onClick={() => onChange(toggleRegion(picks, r.code, taken))} />
                  ))}
                </div>
              </div>
            ),
          ];
        })}
      </div>
    </div>
  );
}

/* ── New profile: name and books, then where and price, then review ── */

const STARTERS: { id: ProfileStarterId; label: string }[] = home === "US"
  ? [{ id: "world", label: "US, Canada & everywhere else" }, { id: "north-america", label: "US & Canada only" }, { id: "canada", label: "US only" }, { id: "copy", label: "Copy General" }, { id: "blank", label: "Start empty" }]
  : [{ id: "world", label: "Canada, US & everywhere else" }, { id: "north-america", label: "Canada & US only" }, { id: "canada", label: "Canada only" }, { id: "copy", label: "Copy General" }, { id: "blank", label: "Start empty" }];

function NewProfileWizard({ open, onClose, profiles, books, assign, onCreate }: {
  open: boolean; onClose: () => void; profiles: any[]; books: any[]; assign: Record<string, string>; onCreate: (p: any, bookIds: string[]) => void;
}) {
  const w = useShopWords();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [starter, setStarter] = useState<ProfileStarterId>("world");
  const [prices, setPrices] = useState<QuickZonePrice[]>(() => starterPrices("world"));
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setStep(1); setName(""); setPicked([]); setQuery(""); setStarter("world"); setPrices(starterPrices("world")); setTried(false); } }, [open]);

  const general = profiles.find((p) => p.id === GENERAL);
  const nameErr = nameProblem(name, profiles.map((p) => p.name));
  const priceErr = prices.some((p) => String(p.first).trim() === "" || !(Number(p.first) >= 0));
  const pickStarter = (s: ProfileStarterId) => { setStarter(s); setPrices(s === "copy" || s === "blank" ? [] : starterPrices(s)); };
  const from = [...new Set(picked.map((b) => assign[b]).filter(Boolean))].map((id) => profiles.find((p) => p.id === id)?.name || "General");
  const q = query.trim().toLowerCase();

  const next = () => {
    if (step === 1 && nameErr) { setTried(true); return; }
    if (step === 2 && priceErr) { setTried(true); return; }
    setTried(false);
    if (step < 3) { setStep(step + 1); return; }
    const built = buildNewProfile({ name, starter, prices, copyFrom: starter === "copy" ? general : undefined }, newId);
    onCreate({ id: `new-${newId()}`, ...built }, picked);
  };

  return (
    <Dialog open={open} onClose={onClose} title="New shipping profile" size="lg"
      footer={<>
        <button type="button" className="spw-pill" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>{step === 1 ? "Cancel" : "Back"}</button>
        <button type="button" className="spw-pill ink" onClick={next}>{step === 3 ? "Create profile" : "Continue"}</button>
      </>}>
      <div className="spw-wiz">
        <div className="spw-steps">
          {["1 Name & books", "2 Where & price", "3 Review"].map((s, i) => <span key={s} className={`spw-step${i + 1 === step ? " now" : i + 1 < step ? " done" : ""}`}>{w(s)}</span>)}
        </div>
        {step === 1 && <>
          <label className="spw-field">Profile name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={w("e.g. Heavy books")} /></label>
          {tried && nameErr && <p className="spw-bad">{nameErr}</p>}
          <span className="spw-mono">{w(`Which books use it? (${picked.length} picked)`)}</span>
          <div className="spw-panel">
            <input type="search" aria-label={w("Find a book")} placeholder={w("Find a book")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="spw-books">
              {books.filter((b) => !q || String(b.title || "").toLowerCase().includes(q)).map((b) => {
                const on = picked.includes(b.id);
                return (
                  <label key={b.id} className={`spw-book${on ? " on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))} />
                    <span><b>{b.title || "Untitled"}</b><small>{kindOf(b)} · now on {profiles.find((p) => p.id === assign[b.id])?.name || "General"}</small></span>
                  </label>
                );
              })}
            </div>
          </div>
        </>}
        {step === 2 && <>
          <span className="spw-mono">Start from</span>
          <div className="spw-chips">
            {STARTERS.map((s) => <button key={s.id} type="button" className="spw-filter" aria-pressed={starter === s.id} onClick={() => pickStarter(s.id)}>{s.label}</button>)}
          </div>
          {starter === "copy" && <p className="spw-note">The new profile starts with General's zones and prices.</p>}
          {starter === "blank" && <div className="spw-empty">No zones yet. Add them after you create the profile.</div>}
          {prices.map((p, i) => (
            <div key={p.key} className="spw-wizcard">
              <h3>{p.zone}</h3>
              <div className="spw-prices">
                {([["first", w("First book ($)")], ["extra", w("Each extra book ($)")], ["days", "Delivery days"]] as const).map(([k, label]) => (
                  <label key={k} className="spw-field">{label}<input inputMode={k === "days" ? undefined : "decimal"} value={p[k]} onChange={(e) => setPrices((all) => all.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></label>
                ))}
              </div>
            </div>
          ))}
          {tried && priceErr && <p className="spw-bad">{w("Enter the first-book price (0 for free) for every zone.")}</p>}
        </>}
        {step === 3 && (
          <div className="spw-wizcard">
            <h3>{name.trim()}</h3>
            <p className="spw-note">{picked.length ? w(`${picked.length} book${picked.length === 1 ? "" : "s"} move here from ${from.join(", ")}.`) : w("No books move here yet.")}</p>
            {starter === "copy" ? <p className="spw-note">Zones: {(general?.zones || []).map((z: any) => zoneSummary(z)).join(" · ") || "none"}</p>
              : prices.map((p) => <p key={p.key} className="spw-note">{p.zone}: ${Number(p.first).toFixed(2)} first, ${Number(p.extra || 0).toFixed(2)} each extra</p>)}
            <p className="spw-note">Nothing goes live until you press Save.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
