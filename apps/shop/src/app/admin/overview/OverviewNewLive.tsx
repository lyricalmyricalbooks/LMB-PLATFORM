import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import "./overviewNewLive.css";
import { EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton } from "../riso/components";
import type { Book, Order } from "./overviewInsights";
import type { Range } from "./overviewRange";
import { adminApi } from "../api";
import { abandonedCartApi } from "../../lib/commerce";
import { SHOP_OWNER_EMAIL } from "../../lib/ownerDevice";
import { shopDayKey } from "../../lib/shopDay";
import { formatReleaseDate } from "../../features/site/preorder";
import { sharedLoad } from "./overviewShared";
import { readNotes, writeNotes } from "./overviewNotesStore";
import { money, moneyFigure, moneyShort } from "./OverviewParts";
import {
  cityMap, cleanLeadDays, dailyRevenue, giftOwed, liveNow, newNoteId, noteEffect, preorderRows, readLeadDays, reprintState, shortDay, soldOutCountdown,
  DEFAULT_LEAD_DAYS, MAX_NOTE_TEXT, REPRINT_WORDS, type SalesNote,
} from "./overviewNewLive";

export type NewLiveWidget = "live" | "notes" | "preorders" | "map" | "giftOwed" | "soldOut";
export type NewLiveConfig = { leadDays?: number };

/**
 * Six Overview board widgets (19 October 2026): On the site right now, Sales with your notes, Pre-order tracker,
 * Order map, Gift card money owed and Sold-out countdown. The board draws each one's outer card; the maths is in
 * overviewNewLive.ts. Carts and gift cards are read once per board (sharedLoad); notes are one admin-only document.
 */
export function OverviewNewLive({ only, paid, allOrders, current, books, range, activeNow, config, onConfig, full, setActiveTab }: {
  only: NewLiveWidget;
  /** Every real paid order, all time (the owner's own removed). */ paid: Order[];
  /** Every order loaded, as stored (unpaid checkouts included). */ allOrders: Order[];
  /** Paid orders in the chosen period. */ current: Order[];
  books: Book[]; range: Range;
  /** People on the site now from Google Analytics (null when it isn't connected or didn't say). */ activeNow: number | null;
  config?: NewLiveConfig; onConfig?: (patch: NewLiveConfig) => void; full?: boolean; setActiveTab?: (tab: string) => void;
}) {
  switch (only) {
    case "live": return <LiveNow allOrders={allOrders} activeNow={activeNow} />;
    case "notes": return <SalesNotes paid={paid} range={range} />;
    case "preorders": return <Preorders paid={paid} books={books} setActiveTab={setActiveTab} />;
    case "map": return <OrderMap current={current} full={!!full} range={range} />;
    case "giftOwed": return <GiftOwed setActiveTab={setActiveTab} />;
    case "soldOut": return <SoldOutWithLead paid={paid} books={books} configured={config?.leadDays} onConfig={onConfig} full={!!full} />;
  }
}

// ── A reprint's wait, shared ──────────────────────────────────────────────────────────────────────────────────────
// Sold-out countdown and Running low draw the same reprint line, so they read one number: the last one typed into a
// countdown on this browser (kept in localStorage, so every board agrees), else the widget's own saved value, else 35.
const LEAD_KEY = "lm:overview-lead-days";
const leadListeners = new Set<() => void>();
const readLead = (): number | null => {
  try { const v = localStorage.getItem(LEAD_KEY); return v === null ? null : cleanLeadDays(v); } catch { return null; }
};
/** Saves a reprint wait for every lead-days widget on this browser. */
export function saveSharedLeadDays(days: number) {
  try { localStorage.setItem(LEAD_KEY, String(cleanLeadDays(days))); } catch { /* storage blocked: the widget's own value still applies */ }
  leadListeners.forEach(l => l());
}
/** The reprint wait every stock widget uses: the shared value, else `fallback`, else 35 days. */
export function useSharedLeadDays(fallback?: number): number {
  const shared = useSyncExternalStore(l => { leadListeners.add(l); return () => { leadListeners.delete(l); }; }, readLead, () => null);
  return shared ?? (fallback ? cleanLeadDays(fallback) : DEFAULT_LEAD_DAYS);
}

// ── On the site right now ─────────────────────────────────────────────────────────────────────────────────────────

function LiveNow({ allOrders, activeNow }: { allOrders: Order[]; activeNow: number | null }) {
  const [carts, setCarts] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // The same shared read as the Abandoned carts widget, so this adds no read of its own.
    sharedLoad("carts", () => abandonedCartApi.list(500))
      .then(rows => setCarts({ rows: rows.filter((c: any) => String(c?.email || "").toLowerCase() !== SHOP_OWNER_EMAIL), error: false }))
      .catch(() => setCarts({ rows: null, error: true }));
    // Re-counts the windows each minute from what is already loaded; the board re-reads orders every 5 minutes.
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Every tile counts the same last 30 minutes.
  const live = useMemo(() => liveNow(allOrders, carts.rows, now, 30), [allOrders, carts.rows, now]);
  const tiles: Array<{ n: number | null; label: string; hint: string }> = [
    { n: activeNow, label: "On the site", hint: activeNow === null ? "needs Google Analytics" : "people browsing" },
    { n: carts.rows ? live.bags : null, label: "Have a bag", hint: carts.error ? "carts couldn't be read" : "with an email, not bought" },
    { n: live.checkout, label: "At checkout", hint: "card or PayPal started, not paid" },
    { n: live.bought, label: "Bought", hint: live.bought ? money(live.boughtTotal) : "no sale" },
  ];
  return (
    <section className="rp-nl-live" aria-label="On the site right now, last 30 minutes">
      <div className="rp-nl-live-grid">
        {tiles.map(t => (
          <div key={t.label} className="rp-nl-live-tile" data-hot={t.n ? "" : undefined}>
            <div className="rp-nl-live-num">{t.n === null ? "—" : t.n.toLocaleString()}</div>
            <div className="rp-nl-live-label">{t.label}</div>
            <div className="rp-nl-live-hint">{t.hint}</div>
          </div>
        ))}
      </div>
      {live.lastBag && <p className="rp-nl-note">Latest bag has <strong>“{live.lastBag}”</strong> in it.</p>}
      <p className="rp-nl-note">All four: the last 30 minutes, updated every minute. People on the site: Google Analytics · bags, checkouts and sales: this shop.</p>
    </section>
  );
}

// ── Sales with your notes ─────────────────────────────────────────────────────────────────────────────────────────

function SalesNotes({ paid, range }: { paid: Order[]; range: Range }) {
  const [notes, setNotes] = useState<{ rows: SalesNote[] | null; error: boolean }>({ rows: null, error: false });
  const today = shopDayKey(Date.now());
  const yesterday = shopDayKey(Date.now() - 86_400_000);
  const [draft, setDraft] = useState<{ id: string | null; day: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // The last delete, kept so it can be undone from the widget itself.
  const [removed, setRemoved] = useState<{ note: SalesNote; rows: SalesNote[] } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const load = (fresh = false) => {
    setNotes({ rows: null, error: false });
    sharedLoad("overviewNotes", readNotes, fresh).then(rows => setNotes({ rows, error: false })).catch(() => setNotes({ rows: null, error: true }));
  };
  useEffect(() => load(), []);
  // Edit and "Add a note" move to the form and put the cursor in its text box, however tall the widget is.
  useEffect(() => {
    if (!draft) return;
    formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    textRef.current?.focus();
  }, [draft?.id, draft === null]);

  const endKey = range.endKey > today ? today : range.endKey;
  const daily = useMemo(() => dailyRevenue(paid, range.startKey, endKey), [paid, range.startKey, endKey]);
  // Over 45 days the line is a 7-day average, so one big day doesn't draw a spike over the notes.
  const smooth = daily.length > 45;
  const series = useMemo(() => (smooth
    ? daily.map((d, i) => { const w = daily.slice(Math.max(0, i - 6), i + 1); return { day: d.day, revenue: w.reduce((t, x) => t + x.revenue, 0) / w.length }; })
    : daily), [daily, smooth]);
  const max = Math.max(1, ...series.map(d => d.revenue));
  const inRange = (notes.rows || []).filter(n => n.day >= range.startKey && n.day <= endKey);
  const outside = (notes.rows || []).length - inRange.length;
  const xOf = (day: string) => {
    const i = series.findIndex(d => d.day === day);
    return series.length > 1 ? (Math.max(0, i) / (series.length - 1)) * 100 : 50;
  };
  const line = series.map((d, i) => `${i === 0 ? "M" : "L"}${series.length > 1 ? ((i / (series.length - 1)) * 100).toFixed(2) : 50},${(100 - (d.revenue / max) * 92).toFixed(2)}`).join(" ");

  const save = async (next: SalesNote[]) => {
    setSaving(true); setSaveError("");
    try {
      const clean = await writeNotes(next);
      sharedLoad("overviewNotes", () => Promise.resolve(clean), true);
      setNotes({ rows: clean, error: false });
      return true;
    } catch (err: any) {
      setSaveError(err?.message && /too many/i.test(err.message) ? err.message : "The note couldn't be saved. Check your connection and try again.");
      return false;
    } finally { setSaving(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !notes.rows) return;
    const text = draft.text.trim();
    if (!text) { setSaveError("Write a few words about what happened, for example “Book fair”."); textRef.current?.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day) || draft.day > today) { setSaveError("Pick a day up to today."); return; }
    const next = draft.id
      ? notes.rows.map(n => (n.id === draft.id ? { ...n, day: draft.day, text } : n))
      : [...notes.rows, { id: newNoteId(), day: draft.day, text }];
    if (await save(next)) { setDraft(null); setRemoved(null); }
  };
  // Deleting happens at once, with Undo right there (the board's own pattern for Remove).
  const remove = async (n: SalesNote) => {
    if (!notes.rows) return;
    const before = notes.rows;
    if (await save(before.filter(x => x.id !== n.id))) { setRemoved({ note: n, rows: before }); if (draft?.id === n.id) setDraft(null); }
  };
  const undo = async () => { if (removed && (await save(removed.rows))) setRemoved(null); };
  const startAt = (day: string) => { setSaveError(""); setDraft({ id: null, day: day > today ? today : day, text: "" }); };
  const effectWords = (n: SalesNote) => {
    const fx = noteEffect(paid, n.day, today);
    return `${fx.complete ? "" : "so far "}${moneyShort(fx.next3)} in the 3 days from it, usual ${moneyShort(Math.round(fx.usual))}`;
  };
  // Clicking the chart starts a note on the day under the pointer.
  const pickDay = (clientX: number, el: HTMLElement) => {
    if (!series.length) return;
    const r = el.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))) * (series.length - 1));
    startAt(series[i].day);
  };

  if (notes.error) return <ErrorState title="Notes unavailable" description="Your notes couldn't be read." onRetry={() => load(true)} />;
  const total = daily.reduce((t, d) => t + d.revenue, 0);
  const best = daily.reduce<{ day: string; revenue: number } | null>((b, d) => (d.revenue > (b?.revenue ?? 0) ? d : b), null);
  return (
    <section className="rp-nl-notes" aria-label="Sales with your notes">
      <p className="rp-viz-takeaway">
        {moneyFigure(total)} {range.phrase}{best ? <>; best day {shortDay(best.day)}, {moneyFigure(best.revenue)}</> : null}.
        {inRange.length ? ` ${inRange.length} note${inRange.length === 1 ? "" : "s"} on the chart.` : ""}
      </p>
      <figure className="rp-nl-chart" aria-label={`${smooth ? "Net revenue, 7-day average" : "Net revenue each day"}, ${range.phrase}: ${money(total)}.`}>
        <div className="rp-nl-chart-plot" onClick={e => { if ((e.target as HTMLElement).closest(".rp-nl-flag")) return; pickDay(e.clientX, e.currentTarget); }}
          title="Click a day to add a note there">
          <span className="rp-nl-chart-max" aria-hidden="true"><span>{moneyShort(max)}{smooth ? " a day (7-day average)" : " a day"}</span></span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true">
            <path d={`${line} L100,100 L0,100 Z`} className="rp-nl-chart-fill" />
            <path d={line} className="rp-nl-chart-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {inRange.map((n, i) => {
            const words = `Note ${i + 1}, ${shortDay(n.day)}: ${n.text} · ${effectWords(n)}`;
            return (
              <span key={n.id} className="rp-nl-flag" style={{ left: `${xOf(n.day)}%` }}>
                <button type="button" className="rp-nl-flag-btn" aria-label={`${words}. Edit this note.`} title={words}
                  onClick={() => { setSaveError(""); setDraft({ id: n.id, day: n.day, text: n.text }); }}>{i + 1}</button>
              </span>
            );
          })}
        </div>
        <figcaption className="rp-nl-axis" aria-hidden="true"><span>{shortDay(range.startKey)}</span><span>Click the chart to note a day</span><span>{shortDay(endKey)}</span></figcaption>
      </figure>

      {notes.rows === null ? <LoadingState label="Loading notes…" /> : (
        <>
          {removed && (
            <p className="rp-nl-undo" role="status">
              Deleted “{removed.note.text}”. <GhostButton size="sm" onClick={undo} disabled={saving}>Undo</GhostButton>
            </p>
          )}
          {inRange.length === 0 && !draft && (
            <p className="rp-nl-note">No notes {range.phrase}. Add one for a post, a newsletter, a fair or a review, and the next three days' sales show beside it, so you can see whether it sold books.</p>
          )}
          {inRange.length > 0 && (
            <ol className="rp-nl-notelist" aria-label="Your notes in this period">
              {inRange.map((n, i) => {
                const fx = noteEffect(paid, n.day, today);
                const tone = !fx.complete ? "wait" : fx.next3 > fx.usual * 1.2 ? "up" : fx.next3 < fx.usual * 0.8 ? "down" : "same";
                return (
                  <li key={n.id} aria-label={`Note ${i + 1}, ${shortDay(n.day)}: ${n.text}`}>
                    <span className="rp-nl-num" aria-hidden="true">{i + 1}</span>
                    <div className="rp-nl-notebody">
                      <div className="rp-nl-notetext">{n.text} <span className="rp-nl-day">· {shortDay(n.day)}</span></div>
                      <div className="rp-nl-effect" data-tone={tone}>
                        {tone === "up" ? "▲ " : tone === "down" ? "▼ " : ""}{fx.complete ? "next 3 days" : "so far"} {money(fx.next3)} · usual {money(Math.round(fx.usual))}
                        {tone === "up" ? " (more than usual)" : tone === "down" ? " (less than usual)" : tone === "wait" ? " (3 days not over yet)" : ""}
                      </div>
                    </div>
                    <span className="rp-nl-noteactions">
                      <GhostButton size="sm" onClick={() => { setSaveError(""); setDraft({ id: n.id, day: n.day, text: n.text }); }} aria-label={`Edit note: ${n.text}`}>Edit</GhostButton>
                      <GhostButton size="sm" onClick={() => remove(n)} disabled={saving} aria-label={`Delete note: ${n.text}`}>Delete</GhostButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {outside > 0 && <p className="rp-nl-note">{outside} more note{outside === 1 ? "" : "s"} outside this period.</p>}
          {draft ? (
            <form ref={formRef} className="rp-nl-form" onSubmit={submit} aria-label={draft.id ? "Edit note" : "Add a note"}>
              <div className="rp-field">
                <label className="rp-label" htmlFor="rp-nl-day">Day</label>
                <input id="rp-nl-day" className="rp-input" type="date" required value={draft.day} max={today} onChange={e => setDraft({ ...draft, day: e.target.value })} />
                <span className="rp-nl-chips">
                  <button type="button" className="rp-nl-chip" aria-pressed={draft.day === today} onClick={() => setDraft({ ...draft, day: today })}>Today</button>
                  <button type="button" className="rp-nl-chip" aria-pressed={draft.day === yesterday} onClick={() => setDraft({ ...draft, day: yesterday })}>Yesterday</button>
                </span>
              </div>
              <label className="rp-field rp-nl-form-text">
                <span className="rp-label">What happened</span>
                <input ref={textRef} className="rp-input" type="text" maxLength={MAX_NOTE_TEXT} placeholder="Instagram reel, newsletter, book fair…" value={draft.text}
                  onChange={e => { setDraft({ ...draft, text: e.target.value }); if (saveError) setSaveError(""); }} />
              </label>
              <span className="rp-nl-form-actions">
                <PrimaryButton size="sm" type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save note" : "Add note"}</PrimaryButton>
                <GhostButton size="sm" type="button" onClick={() => { setDraft(null); setSaveError(""); }}>Cancel</GhostButton>
              </span>
              {saveError && <p className="rp-nl-error" role="alert">{saveError}</p>}
            </form>
          ) : (
            <div className="rp-nl-bar">
              <SecondaryButton size="sm" onClick={() => startAt(today)}>+ Add a note</SecondaryButton>
              {saveError && <span className="rp-nl-error" role="alert">{saveError}</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Pre-order tracker ─────────────────────────────────────────────────────────────────────────────────────────────

function Preorders({ paid, books, setActiveTab }: { paid: Order[]; books: Book[]; setActiveTab?: (tab: string) => void }) {
  const rows = useMemo(() => preorderRows(paid, books), [paid, books]);
  if (!rows.length) {
    return <EmptyState inline title="No books on pre-order"
      description="Switch on Pre-order for a book (Books › edit › Inventory) and the copies readers have promised to buy show here, against the copies you can sell."
      action={setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("catalog")}>Open books</SecondaryButton> : undefined} />;
  }
  return (
    <ul className="rp-nl-pre" aria-label="Pre-orders by book">
      {rows.map(r => {
        const share = r.run ? Math.min(100, (r.promised / r.run) * 100) : 0;
        const when = r.release ? `out ${formatReleaseDate(r.release)}` : "date to be announced";
        return (
          <li key={r.bookId} data-full={r.full ? "" : undefined}>
            <div className="rp-nl-pre-head">
              <strong>{r.title}</strong>
              <span className="rp-nl-mono">{when}</span>
            </div>
            <div className="rp-nl-pre-counts">
              <span><strong className="rp-nl-mono">{r.promised}</strong> pre-ordered</span>
              {r.run !== null && <span><strong className="rp-nl-mono">{r.left}</strong> still free · <strong className="rp-nl-mono">{r.run}</strong> copies in all</span>}
            </div>
            {r.run !== null
              ? <>
                  <div className="rp-nl-meter" role="progressbar" aria-label={`${r.title}: copies pre-ordered`} aria-valuemin={0} aria-valuemax={r.run} aria-valuenow={r.promised}
                    aria-valuetext={`${r.promised} of ${r.run} copies pre-ordered (${Math.round(share)}%)`}><span style={{ width: `${share}%` }} /></div>
                  <div className="rp-nl-meter-ticks" aria-hidden="true"><span>0</span><span>{Math.round(share)}% promised</span><span>{r.run}</span></div>
                </>
              : <p className="rp-nl-note">Stock isn't counted for this book, so any number of pre-orders can come in.</p>}
            {r.full && <p className="rp-nl-warn"><span aria-hidden="true">! </span>{r.left === 0 ? "Every copy is promised" : `Only ${r.left} cop${r.left === 1 ? "y" : "ies"} left`} before release.</p>}
          </li>
        );
      })}
      <li className="rp-nl-pre-foot"><span className="rp-nl-note">Copies in all = copies on the shelf plus those already pre-ordered.</span>
        {setActiveTab && <GhostButton size="sm" onClick={() => setActiveTab("catalog")}>Open books</GhostButton>}</li>
    </ul>
  );
}

// ── Order map ─────────────────────────────────────────────────────────────────────────────────────────────────────

const MAP_W = 136, MAP_H = 100;
function OrderMap({ current, full, range }: { current: Order[]; full: boolean; range: Range }) {
  const map = useMemo(() => cityMap(current), [current]);
  if (!current.length) {
    return <EmptyState inline title={`No paid orders ${range.phrase}`}
      description="Each order's town shows here as a dot (never the street). Pick a longer period at the top of the board to see where readers are." />;
  }
  const placed = map.cities.filter(c => c.x !== null && c.y !== null);
  const unplaced = map.cities.filter(c => c.x === null);
  const top = Math.max(1, ...map.cities.map(c => c.orders));
  const ranked = map.cities.slice(0, full ? 20 : 8);
  const radius = (orders: number) => 1.6 + Math.sqrt(orders / top) * 4.4;
  // The three busiest places are named on the map; labels that would overlap are nudged down below each other.
  const labels = placed.slice(0, 3).map(c => ({ c, x: (c.x! / 100) * MAP_W + radius(c.orders) + 1, y: (c.y! / 100) * MAP_H + 1.4 }))
    .sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    if (labels[i].y - prev.y < 4.6 && Math.abs(labels[i].x - prev.x) < 26) labels[i].y = prev.y + 4.6;
  }
  const lat = (d: number) => ((60 - d) / 36) * MAP_H; // the same box as project()
  const lon = (d: number) => ((d + 130) / 70) * MAP_W;
  const lead = map.cities[0];
  return (
    <section className="rp-nl-map" aria-label={`Orders by city, ${range.phrase}`}>
      {lead && <p className="rp-viz-takeaway rp-nl-map-take">Most orders from <strong>{lead.city}</strong> ({lead.orders}).</p>}
      <figure className="rp-nl-map-fig">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Map of Canada and the US: ${placed.slice(0, 5).map(c => `${c.city} ${c.orders}`).join(", ") || "no mapped cities"}`}>
          {[30, 40, 50].map(d => <line key={d} x1={0} x2={MAP_W} y1={lat(d)} y2={lat(d)} className="rp-nl-grid" />)}
          {[-120, -110, -100, -90, -80, -70].map(d => <line key={d} y1={0} y2={MAP_H} x1={lon(d)} x2={lon(d)} className="rp-nl-grid" />)}
          {/* The 49th parallel, then the Great Lakes and St. Lawrence, roughly. */}
          <polyline className="rp-nl-border" points={[[49, -123.3], [49, -95.2], [48.3, -89.5], [46.5, -84.5], [45.3, -82.5], [43, -82.4], [42, -83], [41.7, -82.5], [42.8, -79], [43.6, -79.2], [44.2, -76.4], [45, -74.7], [45, -71.5], [47.3, -69.2], [47.1, -67.8], [45.1, -67]].map(([a, o]) => `${lon(o)},${lat(a)}`).join(" ")} />
          <text x={lon(-112)} y={lat(56)} className="rp-nl-country">CANADA</text>
          <text x={lon(-108)} y={lat(37)} className="rp-nl-country">UNITED STATES</text>
          {[...placed].reverse().map(c => (
            <circle key={c.key} cx={(c.x! / 100) * MAP_W} cy={(c.y! / 100) * MAP_H} r={radius(c.orders)} className="rp-nl-dot">
              <title>{`${c.city}${c.region ? `, ${c.region}` : ""}: ${c.orders} order${c.orders === 1 ? "" : "s"}`}</title>
            </circle>
          ))}
          {labels.map(l => <text key={l.c.key} x={l.x} y={l.y} className="rp-nl-city">{l.c.city}</text>)}
        </svg>
        <figcaption className="rp-nl-note">Canada and the US; the line is the border. A dot's area grows with its orders. Town only, never the street.</figcaption>
      </figure>
      <div className="rp-nl-map-list">
        <ol aria-label="Cities with the most orders">
          {ranked.map(c => (
            <li key={c.key}>
              <span>{c.city}{c.region ? <span className="rp-nl-dim">, {c.region}</span> : null}{c.x === null ? <span className="rp-nl-dim"> · not on the map</span> : null}</span>
              <span className="rp-nl-mono">{c.orders} · {money(c.revenue)}</span>
            </li>
          ))}
        </ol>
        {ranked.length < map.cities.length && <p className="rp-nl-note">{map.cities.length - ranked.length} more cities{unplaced.length ? `, ${unplaced.length} not on the map` : ""}.</p>}
        {map.elsewhere.length > 0 && (
          <p className="rp-nl-note"><strong>Elsewhere:</strong> {map.elsewhere.slice(0, 6).map(e => `${e.country} ${e.orders}`).join(" · ")}{map.elsewhere.length > 6 ? ` · ${map.elsewhere.length - 6} more` : ""}</p>
        )}
        {map.unknown > 0 && <p className="rp-nl-note">{map.unknown} order{map.unknown === 1 ? "" : "s"} without a city (pickup or digital).</p>}
      </div>
    </section>
  );
}

// ── Gift card money owed ──────────────────────────────────────────────────────────────────────────────────────────

function GiftOwed({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const [cards, setCards] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const load = (fresh = false) => {
    setCards({ rows: null, error: false });
    sharedLoad("giftCards", () => adminApi.getGiftCards(), fresh).then(rows => setCards({ rows, error: false })).catch(() => setCards({ rows: null, error: true }));
  };
  useEffect(() => load(), []);
  const s = useMemo(() => (cards.rows ? giftOwed(cards.rows) : null), [cards.rows]);
  if (cards.error) return <ErrorState title="Gift cards unavailable" description="Gift cards couldn't be read." onRetry={() => load(true)} />;
  if (!s) return <LoadingState label="Reading gift cards…" />;
  if (!s.total) {
    return <EmptyState inline title="No gift cards sold yet"
      description="Add a book with Product type “Gift card” (its editions are the amounts) and, once readers buy one, the money still to be spent shows here."
      action={setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("giftCards")}>Open gift cards</SecondaryButton> : undefined} />;
  }
  const cad = (minor: number) => money(minor / 100);
  return (
    <section className="rp-nl-gift" aria-label="Gift card money owed">
      <span className="rp-viz-hero">{moneyFigure(s.owedMinor / 100)}</span>
      <span className="rp-viz-hero-sub">still to be spent, on {s.cards} card{s.cards === 1 ? "" : "s"}</span>
      <ul className="rp-nl-stats">
        <li><span>Sold this year</span><span className="rp-nl-mono">{cad(s.soldYearMinor)}</span></li>
        <li><span>Spent so far</span><span className="rp-nl-mono">{cad(s.spentMinor)}</span></li>
        <li data-tone={s.staleCards ? "warn" : undefined}>
          <span>{s.staleCards ? <span className="rp-nl-glyph" aria-hidden="true">!</span> : null}Never used, over 6 months</span>
          <span className="rp-nl-mono">{s.staleCards} card{s.staleCards === 1 ? "" : "s"} · {cad(s.staleMinor)}</span>
        </li>
      </ul>
      {setActiveTab && <GhostButton size="sm" onClick={() => setActiveTab("giftCards")}>Open gift cards</GhostButton>}
    </section>
  );
}

// ── Sold-out countdown ────────────────────────────────────────────────────────────────────────────────────────────

/** The countdown with the shared reprint wait: typing a new wait saves it for every stock widget. */
function SoldOutWithLead({ paid, books, configured, onConfig, full }: { paid: Order[]; books: Book[]; configured?: number; onConfig?: (patch: NewLiveConfig) => void; full: boolean }) {
  const leadDays = useSharedLeadDays(configured);
  return <SoldOut paid={paid} books={books} leadDays={leadDays} full={full}
    onLead={d => { saveSharedLeadDays(d); onConfig?.({ leadDays: d }); }} />;
}

const SCALE = 120;
function SoldOut({ paid, books, leadDays, onLead, full }: { paid: Order[]; books: Book[]; leadDays: number; onLead: (d: number) => void; full: boolean }) {
  const rows = useMemo(() => soldOutCountdown(paid, books, leadDays, Date.now(), full ? 25 : 10), [paid, books, leadDays, full]);
  const [editing, setEditing] = useState(false);
  const [lead, setLead] = useState(String(leadDays));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setLead(String(leadDays)); }, [leadDays, editing]);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  useEffect(() => { if (!saved) return; const t = window.setTimeout(() => setSaved(false), 2500); return () => window.clearTimeout(t); }, [saved]);
  const today = shopDayKey(Date.now());
  const at = (d: number) => `${Math.min(100, (d / SCALE) * 100)}%`;
  const tick = (d: number) => { const t = new Date(`${today}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return shortDay(t.toISOString().slice(0, 10)); };
  const commit = (e?: FormEvent) => {
    e?.preventDefault();
    const r = readLeadDays(lead);
    if ("error" in r) { setError(r.error); input.current?.focus(); return; }
    setError(""); setEditing(false);
    if (r.days !== leadDays) { onLead(r.days); setSaved(true); }
  };
  const soon = rows.filter(r => reprintState(r.days, leadDays) === "now");
  return (
    <section className="rp-nl-count" aria-label="Sold-out countdown">
      {editing ? (
        <form className="rp-nl-bar rp-nl-leadform" onSubmit={commit} noValidate>
          <label className="rp-nl-lead">
            <span>A reprint takes</span>
            <input ref={input} className="rp-input" type="text" inputMode="numeric" value={lead} aria-label="Days a reprint takes"
              aria-invalid={error ? true : undefined} aria-describedby={error ? "rp-nl-lead-err" : undefined}
              onChange={e => { setLead(e.target.value); if (error) setError(""); }} onKeyDown={e => { if (e.key === "Escape") { setEditing(false); setError(""); } }} />
            <span>days</span>
          </label>
          <PrimaryButton size="sm" type="submit">Save</PrimaryButton>
          <GhostButton size="sm" type="button" onClick={() => { setEditing(false); setError(""); }}>Cancel</GhostButton>
          {error && <p id="rp-nl-lead-err" className="rp-nl-error" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="rp-nl-bar">
          <span className="rp-nl-lead-read">A reprint takes <strong>{leadDays} days</strong></span>
          <GhostButton size="sm" onClick={() => setEditing(true)} aria-label={`Change how long a reprint takes (now ${leadDays} days)`}>Change</GhostButton>
          {saved && <span className="rp-nl-saved" role="status"><span aria-hidden="true">✓ </span>Saved · Running low uses it too</span>}
        </div>
      )}
      {rows.length === 0 ? <EmptyState inline title="Nothing on course to sell out"
        description="No counted print book sold in the last 30 days. Books whose stock you count (Books › edit › Inventory) appear here as soon as they sell." /> : (
        <>
          <p className="rp-viz-takeaway rp-nl-count-take">
            {soon.length ? <><strong>{soon.length} book{soon.length === 1 ? "" : "s"}</strong> will sell out before a reprint could arrive.</> : "Nothing sells out before a reprint could arrive."}
          </p>
          <div className="rp-nl-time" aria-hidden="true">
            <span className="rp-nl-time-lead" style={{ left: at(leadDays) }} />
            {[0, 30, 60, 90, 120].map(d => (
              <span key={d} className="rp-nl-time-tick" data-minor={d === 30 || d === 90 ? "" : undefined}
                style={{ left: at(d), transform: d === 0 ? "none" : d === SCALE ? "translateX(-100%)" : undefined }}>{d === 0 ? "Today" : tick(d)}</span>
            ))}
          </div>
          <ol className="rp-nl-countlist" aria-label={`Books by days until sold out. A reprint takes ${leadDays} days.`}>
            {rows.map(r => {
              const days = Math.round(r.days);
              const state = reprintState(r.days, leadDays);
              return (
                <li key={r.key} data-state={state}>
                  <div className="rp-nl-pre-head">
                    <strong>{r.label}</strong>
                    <span className="rp-nl-mono">{days > SCALE ? `${SCALE}+ days` : `${days} day${days === 1 ? "" : "s"}`} · around {shortDay(r.outOn)}</span>
                  </div>
                  <div className="rp-nl-countrack">
                    <span className="rp-nl-countbar" style={{ width: at(Math.max(1, r.days)) }} />
                    <span className="rp-nl-time-lead" style={{ left: at(leadDays) }} />
                  </div>
                  <div className="rp-nl-note">
                    {r.stock} left · {r.sold30} sold in 30 days{" "}
                    <span className="rp-nl-state" data-state={state}><span aria-hidden="true">{REPRINT_WORDS[state].glyph} </span>{REPRINT_WORDS[state].word}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="rp-nl-note">Bar = days until sold out at the last 30 days' pace (0–{SCALE}+). Dashed line = how long a reprint takes. Plan a reprint = within 1.5× that wait.</p>
        </>
      )}
    </section>
  );
}
