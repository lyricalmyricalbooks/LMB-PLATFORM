import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { StockistsCard } from "./StockistsCard";
import { NewsletterCard } from "./NewsletterCard";
import { copyText } from "./clipboard";
import { getOrdersCached } from "./ordersCache";
import { useShopWords } from "./shopWords";
import { groupNameProblem, matchingGroup, removeGroup, saveGroup, type CustomerGroup, type GroupFilters } from "./customerGroups";
import { customerGroupsStore } from "./customerGroupsStore";
import {
  agoWords, buildCustomers, withMovedCustomers, withBookings, bookingsLine, clientCard, consentOf, copiesOf, customerCountries, customerStats, customersToCsv, parseTags, CONSENT_LABELS, SEGMENT_LABELS,
  type Consent, type CustomerRow, type CustomerSegment,
} from "./customerInsights";
import {
  DataTable, PageActions, Dialog, EmptyState, ErrorState, FilterBar, GhostButton, LoadingState, MetricCard, Pagination, PrimaryButton, SearchField,
  SecondaryButton, SectionCard, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, useConfirm, type BadgeTone, type Column,
} from "./riso/components";
import { MONEY_SIGN } from "./moneySign";
import { bookingsAdmin, readBookingsBetween, useBookingsOn, type Booking, type PackRow } from "./bookingsApi";
import { cardText, moneyText, paymentText, timeText } from "./bookingsView";
import type { BookAgain } from "./Bookings";
import { useShopSells } from "./shopWords";
import { sellsServices } from "../../shared/shopSells";
import { SHOP_CURRENCY } from "./moneySign";
import "./clientCard.css";
import { ClientFormFacts } from "./clientForm";
import { ClientVisits } from "./ClientVisits.tsx";
import { emailHash } from "./emailHash";
import { dayOf } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";

const money = (n: number) => `${MONEY_SIGN}${n.toFixed(2)}`;
const TONE: Record<CustomerSegment, BadgeTone> = { vip: "primary", "vip-lapsed": "danger", returning: "success", new: "info", "at-risk": "warning", moved: "neutral", booked: "info" };
const CONSENT_TONE: Record<Consent, BadgeTone> = { subscribed: "success", "opted-out": "danger", none: "neutral" };
// Opened rarely, so it loads only when asked for (plan 3.1).
const CustomerMoveDialog = lazy(() => import("./ShopMoveDialogs").then(m => ({ default: m.CustomerMoveDialog })));
// Book again (services plan, phase 5): the New booking window from Bookings, loaded only when asked for.
const BookAgainDialog = lazy(() => import("./Bookings").then(m => ({ default: m.BookAgainDialog })));
const PAGE_SIZE = 25;
type Note = { note: string; tags: string[]; phone?: string };
type Draft = { note: string; tags: string; phone: string; loaded: boolean };
/** Sub tabs of one customer's window. Ids are prefixed: `Tabs` renders `id="rp-tab-<id>"` and the segment tabs use plain ids. */
export type CustomerTab = "cust-summary" | "cust-orders" | "cust-bookings" | "cust-notes";
const ZONE = shopTimeZone();
/** "Fri, Nov 21", with the year when it isn't this year's, in the shop's own time zone. */
const bookingDay = (iso: string) => {
  const day = dayOf(Date.parse(iso), ZONE);
  const sameYear = day.slice(0, 4) === dayOf(Date.now(), ZONE).slice(0, 4);
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};
/** How far back and ahead the Customers page reads bookings: a year back, six months ahead. */
const BOOKINGS_BACK_DAYS = 365, BOOKINGS_AHEAD_DAYS = 183;
const shortDate = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export { emailHash };

/** `#customers?q=…` prefills the search (global search links here). */
const hashQuery = () => {
  try { return new URLSearchParams(window.location.hash.split("?")[1] || "").get("q") || ""; } catch { return ""; }
};

export function Customers({ initialQuery }: { initialQuery?: string } = {}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [seg, setSeg] = useState<"all" | CustomerSegment>("all");
  const [q, setQ] = useState(() => initialQuery || hashQuery());
  const [sort, setSort] = useState<"spent" | "orders" | "recent" | "name">("spent");
  const [consentFilter, setConsentFilter] = useState<"all" | Consent>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<CustomerRow | null>(null);
  const [detailTab, setDetailTab] = useState<CustomerTab>("cust-summary");
  const [exportOpen, setExportOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [consent, setConsent] = useState<{ subscribed: Set<string>; optedOutHashes: Set<string> | null } | null>(null);
  const [hashes, setHashes] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  // The stored notes as read, for the customers brought over who haven't ordered here yet.
  const [noteRows, setNoteRows] = useState<{ email?: string; name?: string; place?: string; note?: string }[]>([]);
  // loaded: the stored note for this customer was read, so saving can't replace it with blanks.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notesState, setNotesState] = useState<"loading" | "ok" | "failed">("loading");
  const [savingNote, setSavingNote] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const w = useShopWords();
  // Saved groups: the filters below under a name (customerGroups.ts), kept on the shop's account.
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  // Bookings (beta): who booked, read once when the shop has Bookings. A failed read just leaves them out.
  const bookingsOn = useBookingsOn(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Packs of visits (read through the server: no browser may read them), for the client card. A failed read leaves them out.
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [bookingsRead, setBookingsRead] = useState(0);
  useEffect(() => {
    if (!bookingsOn) return;
    let alive = true;
    const now = Date.now();
    readBookingsBetween(new Date(now - BOOKINGS_BACK_DAYS * 86_400_000).toISOString(), new Date(now + BOOKINGS_AHEAD_DAYS * 86_400_000).toISOString())
      .then((rows) => { if (alive) setBookings(rows); }).catch(() => { if (alive) setBookings([]); });
    bookingsAdmin<{ packs: PackRow[] }>("packs").then((a) => { if (alive) setPacks(a.packs || []); }).catch(() => { if (alive) setPacks([]); });
    return () => { alive = false; };
  }, [bookingsOn, bookingsRead]);
  const servicesShop = sellsServices(useShopSells());
  // A services shop's own names for the people who only booked or were brought over.
  const segLabel = (seg: CustomerSegment) => (servicesShop && seg === "booked" ? "Booked" : servicesShop && seg === "moved" ? "Brought over" : SEGMENT_LABELS[seg]);
  const [bookAgain, setBookAgain] = useState<BookAgain | null>(null);

  useEffect(() => { if (initialQuery !== undefined) setQ(initialQuery); }, [initialQuery]);

  const load = async (force = false) => {
    setFailed(false); setLoading(true);
    try { setOrders(await getOrdersCached({ force })); }
    catch (e) { console.error(e); setFailed(true); toast.error("Customers could not be loaded"); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    adminApi.getMarketingConsent().then(setConsent).catch(() => setConsent(null));
    loadNotes();
    customerGroupsStore.load().then(setGroups).catch(() => setGroups([]));
  }, []);
  const loadNotes = () => {
    setNotesState("loading");
    adminApi.listCustomerNotes()
      .then((rows) => { setNoteRows(rows); setNotes(new Map(rows.map((r) => [r.id, { note: r.note || "", tags: r.tags || [], phone: r.phone || "" }]))); setNotesState("ok"); })
      .catch((e) => { console.error(e); setNotesState("failed"); });
  };

  const all = useMemo(() => withBookings(withMovedCustomers(buildCustomers(orders), noteRows), bookings), [orders, noteRows, bookings]);
  useEffect(() => {
    let alive = true;
    Promise.all(all.map(async (c) => [c.key, await emailHash(c.key)] as const))
      .then((pairs) => { if (alive) setHashes(new Map(pairs)); }).catch(() => {});
    return () => { alive = false; };
  }, [all]);

  const consentFor = (c: CustomerRow): Consent => consent ? consentOf(c.email, consent.subscribed, consent.optedOutHashes, hashes.get(c.key)) : "none";
  const noteFor = (c: CustomerRow): Note | undefined => { const h = hashes.get(c.key); return h ? notes.get(h) : undefined; };
  const allTags = useMemo(() => Array.from(new Set(Array.from(notes.values()).flatMap((n) => n.tags))).sort(), [notes]);

  const stats = useMemo(() => customerStats(all), [all]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, vip: 0, "vip-lapsed": 0, returning: 0, new: 0, "at-risk": 0, moved: 0, booked: 0 };
    all.forEach((x) => c[x.segment]++);
    return c;
  }, [all]);

  const countries = useMemo(() => customerCountries(all), [all]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((c) => (seg === "all" || c.segment === seg)
        && (!country || c.country === country)
        && (!s || `${c.email} ${c.name} ${c.city}`.toLowerCase().includes(s))
        && (consentFilter === "all" || consentFor(c) === consentFilter)
        && (!tagFilter || (noteFor(c)?.tags || []).includes(tagFilter)))
      .sort((a, b) =>
        sort === "orders" ? b.orderCount - a.orderCount
        : sort === "recent" ? b.lastOrderAt - a.lastOrderAt
        : sort === "name" ? (a.name || a.email).localeCompare(b.name || b.email)
        : b.totalSpent - a.totalSpent);
  }, [all, seg, country, q, sort, consentFilter, tagFilter, consent, hashes, notes]);

  useEffect(() => setPage(1), [seg, country, q, sort, consentFilter, tagFilter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const filtered = seg !== "all" || !!q.trim() || consentFilter !== "all" || !!tagFilter || !!country;
  const current: GroupFilters = { seg, q, consent: consentFilter, tag: tagFilter, country, sort };
  const currentGroup = filtered ? matchingGroup(groups, current) : null;
  const applyGroup = (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    setSeg(g.seg as any); setQ(g.q); setConsentFilter(g.consent as any); setTagFilter(g.tag); setCountry(g.country); setSort(g.sort);
  };
  const storeGroups = async (next: CustomerGroup[], done: string) => {
    setGroupBusy(true);
    try { await customerGroupsStore.save(next); setGroups(next); toast.success(done); return true; }
    catch (e) { console.error(e); toast.error("The groups couldn't be saved. Try again."); return false; }
    finally { setGroupBusy(false); }
  };
  const nameProblem = naming === null ? null : groupNameProblem(naming, groups);
  const saveNamed = async () => {
    if (naming === null || nameProblem) return;
    if (await storeGroups(saveGroup(groups, naming, current, () => crypto.randomUUID().slice(0, 12)), `Saved “${naming.trim()}”`)) setNaming(null);
  };
  const deleteGroup = async (g: CustomerGroup) => {
    if (!(await ask({ title: `Delete “${g.name}”?`, message: "Only the saved group goes. No customer is changed.", confirmLabel: "Delete group" }))) return;
    await storeGroups(removeGroup(groups, g.id), "Group deleted");
  };
  const clearFilters = () => { setSeg("all"); setQ(""); setConsentFilter("all"); setTagFilter(""); setCountry(""); };

  const exportCsv = () => {
    if (!rows.length) return toast.error("Nothing to export");
    const blob = new Blob([customersToCsv(rows, consentFor, (c) => noteFor(c)?.tags || [])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const notesReadyFor = (c: CustomerRow) => notesState === "ok" && hashes.has(c.key);
  const openCustomer = (c: CustomerRow) => {
    if (open?.key !== c.key) setDetailTab("cust-summary");
    setOpen(c);
    const n = noteFor(c);
    setDraft({ note: n?.note || "", tags: (n?.tags || []).join(", "), phone: n?.phone || "", loaded: notesReadyFor(c) });
  };
  // Notes (or the customer's id) arrived after the panel opened: show the stored note before allowing a save.
  useEffect(() => {
    if (!open || !draft || draft.loaded || !notesReadyFor(open)) return;
    const n = noteFor(open);
    setDraft({ note: n?.note || "", tags: (n?.tags || []).join(", "), phone: n?.phone || "", loaded: true });
  }, [open, draft, notesState, hashes, notes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing with an unsaved note asks first, so typed notes are never dropped by accident.
  const noteChanged = () => {
    if (!open || !draft || !draft.loaded) return false;
    const n = noteFor(open);
    return draft.note !== (n?.note || "") || parseTags(draft.tags).join(",") !== (n?.tags || []).join(",") || draft.phone.trim() !== (n?.phone || "");
  };
  const closeCustomer = async () => {
    if (noteChanged() && !(await ask({ title: "Discard your note changes?", message: w("The private note or tags for this customer have changes that aren't saved."), confirmLabel: "Discard changes" }))) return false;
    setOpen(null);
    return true;
  };
  // Book again: the client window closes (asking first about an unsaved note) and the New booking window opens filled in.
  const startBookAgain = async (again: BookAgain) => { if (await closeCustomer()) setBookAgain(again); };
  const saveNote = async () => {
    if (!open || !draft || !draft.loaded) return;
    const id = hashes.get(open.key) || await emailHash(open.key);
    const data = { email: open.key, note: draft.note.slice(0, 5000), tags: parseTags(draft.tags), phone: draft.phone.trim().slice(0, 40) };
    setSavingNote(true);
    try {
      await adminApi.saveCustomerNote(id, data);
      setNotes((m) => new Map(m).set(id, { note: data.note, tags: data.tags, phone: data.phone }));
      toast.success("Note saved");
    } catch (e) { console.error(e); toast.error("Couldn't save the note — nothing was changed."); }
    finally { setSavingNote(false); }
  };

  const columns: Column<CustomerRow>[] = [
    { key: "customer", header: "Customer", lead: true, render: (c) => (
      <div style={{ overflowWrap: "anywhere", minWidth: 170 }}>
        <button type="button" className="rp-row-link" onClick={() => openCustomer(c)} aria-label={`View ${c.name || c.email}`}>{c.name || c.email || "—"}</button>
        <div className="rp-hint">{c.email}</div>
        {(noteFor(c)?.tags || []).length > 0 && <div className="rp-hint rp-mono">{noteFor(c)!.tags.join(" · ")}</div>}
      </div>
    ) },
    { key: "segment", header: "Segment", render: (c) => <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={TONE[c.segment]}>{segLabel(c.segment)}</StatusBadge></span> },
    { key: "consent", header: "Marketing", render: (c) => consent ? <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={CONSENT_TONE[consentFor(c)]}>{CONSENT_LABELS[consentFor(c)]}</StatusBadge></span> : "—" },
    { key: "location", header: "Location", render: (c) => [c.city, c.country].filter(Boolean).join(", ") || "—" },
    { key: "orders", header: "Orders", numeric: true, render: (c) => c.orderCount },
    { key: "spent", header: "Net spent", numeric: true, render: (c) => money(c.totalSpent) },
    { key: "aov", header: "Avg order", numeric: true, render: (c) => money(c.avgOrder) },
    { key: "last", header: "Last order", render: (c) => !c.lastOrderAt ? "—" : <span style={{ whiteSpace: "nowrap" }}>{`${new Date(c.lastOrderAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} (${agoWords(c.daysSinceLast)})`}</span> },
  ];

  if (loading) return <LoadingState label="Loading customers…" />;
  if (failed) return <ErrorState title="Customers could not be loaded" onRetry={() => load(true)} />;

  return (
    <div className="rp-stack">
      {/* Bringing customers over and exporting them are page actions, so they sit by the title, not among the filters. */}
      <PageActions>
        <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={() => setExportOpen(true)}>Export CSV</SecondaryButton>
        <SecondaryButton icon={<Upload size={16} aria-hidden />} onClick={() => setMoveOpen(true)}>{w("Bring customers over")}</SecondaryButton>
      </PageActions>
      <div className="rp-kpi-grid">
        <MetricCard label="Customers" value={stats.total} footer="With at least one paid order" />
        <MetricCard label="Repeat rate" value={`${Math.round(stats.repeatRate * 100)}%`} footer={`${stats.repeat} bought more than once`} />
        <MetricCard label="Avg lifetime value" value={money(stats.avgLtv)} footer="Per customer, after refunds" />
        <MetricCard label="At risk" value={counts["at-risk"] + counts["vip-lapsed"]} tone={counts["at-risk"] + counts["vip-lapsed"] ? "warn" : undefined}
          footer={`No order in 180+ days · ${counts["vip-lapsed"]} lapsed VIP${counts["vip-lapsed"] === 1 ? "" : "s"}`} />
      </div>
      <Tabs label="Customer segments" value={seg} onChange={(v) => setSeg(v as any)}
        tabs={[
          { id: "all", label: "All", count: counts.all },
          { id: "vip", label: "VIP", count: counts.vip },
          { id: "vip-lapsed", label: "VIP · lapsed", count: counts["vip-lapsed"] },
          { id: "returning", label: "Returning", count: counts.returning },
          { id: "new", label: "New", count: counts.new },
          { id: "at-risk", label: "At risk", count: counts["at-risk"] },
          ...(counts.moved ? [{ id: "moved", label: segLabel("moved"), count: counts.moved }] : []),
          ...(counts.booked ? [{ id: "booked", label: segLabel("booked"), count: counts.booked }] : []),
        ]} />
      <FilterBar>
        {groups.length > 0 && (
          <SelectField label="Saved groups" hideLabel value={currentGroup?.id || ""} onChange={(e) => applyGroup(e.target.value)}>
            <option value="">Saved groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </SelectField>
        )}
        <div className="rp-grow"><SearchField label="Search customers" placeholder="Search name, email or city…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectField label="Marketing consent" hideLabel value={consentFilter} onChange={(e) => setConsentFilter(e.target.value as any)}>
          <option value="all">Any marketing consent</option>
          <option value="subscribed">Subscribed to the newsletter</option>
          <option value="none">Not subscribed</option>
          <option value="opted-out">Opted out</option>
        </SelectField>
        {allTags.length > 0 && (
          <SelectField label="Tag" hideLabel value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">Any tag</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
        )}
        <SelectField label="Sort customers" hideLabel value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="spent">Net spent</option>
          <option value="orders">Order count</option>
          <option value="recent">Most recent</option>
          <option value="name">Name A–Z</option>
        </SelectField>
        {countries.length > 1 && (
          <SelectField label="Filter by country" hideLabel value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c.country} value={c.country}>{c.country} ({c.count})</option>)}
          </SelectField>
        )}
        {filtered && !currentGroup && <GhostButton onClick={() => setNaming("")}>Save as group</GhostButton>}
        {currentGroup && <GhostButton disabled={groupBusy} onClick={() => void deleteGroup(currentGroup)}>Delete group</GhostButton>}
        {filtered && <GhostButton onClick={clearFilters}>Clear filters</GhostButton>}
      </FilterBar>
      {naming !== null && (
        <Dialog open onClose={() => setNaming(null)} title="Save as group" description="Keeps these filters under a name, so you can pick them again from Saved groups."
          footer={<><SecondaryButton onClick={() => setNaming(null)}>Cancel</SecondaryButton><PrimaryButton disabled={groupBusy || !!nameProblem} onClick={() => void saveNamed()}>{groupBusy ? "Saving…" : "Save group"}</PrimaryButton></>}>
          <form onSubmit={(e) => { e.preventDefault(); void saveNamed(); }}>
            <TextField label="Group name" placeholder="e.g. Toronto regulars" maxLength={60} value={naming} onChange={(e) => setNaming(e.target.value)} data-autofocus
              hint={naming.trim() && nameProblem ? nameProblem : `${rows.length} customer${rows.length === 1 ? "" : "s"} match now. The group updates as customers change.`} />
          </form>
        </Dialog>
      )}
      {bookAgain && <Suspense fallback={null}><BookAgainDialog initial={bookAgain} onClose={() => setBookAgain(null)} onBooked={() => setBookingsRead((n) => n + 1)} /></Suspense>}
      {moveOpen && <Suspense fallback={null}><CustomerMoveDialog services={servicesShop} onClose={() => setMoveOpen(false)} onDone={() => { loadNotes(); adminApi.getMarketingConsent().then(setConsent).catch(() => {}); }} /></Suspense>}
      <SectionCard flush collapsible={false} title="Customers" description={`${rows.length} customer${rows.length === 1 ? "" : "s"} · paid orders only, refunds taken off${counts.moved ? ", plus the customers you brought over who haven't ordered here yet" : ""}${counts.booked ? `${counts.moved ? " and" : ", plus"} people who booked a time` : ""}.`}>
        <DataTable caption="Customers" columns={columns} rows={pageRows} rowKey={(c) => c.key} onRowClick={openCustomer}
          empty={all.length === 0
            ? <EmptyState title="No customers yet" description="Customers appear here after their first paid order." />
            : <EmptyState title="No customers match" description="Try another segment, search or filter."
                action={<SecondaryButton onClick={clearFilters}>Clear filters</SecondaryButton>} />} />
        {rows.length > PAGE_SIZE && <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} />}
      </SectionCard>

      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} title="Export customers"
        description={`${rows.length} customer${rows.length === 1 ? "" : "s"} in the current view.`}
        footer={<><SecondaryButton onClick={() => setExportOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={exportCsv}>Download CSV</PrimaryButton></>}>
        <p>The file includes a <strong>Consented to marketing</strong> column. Only email marketing (newsletters, offers) to customers marked <strong>Yes</strong> — buying from you is not consent to marketing under Canada's anti-spam law (CASL).</p>
        {!consent && <p className="rp-hint">Newsletter sign-ups couldn't be read, so every customer shows No.</p>}
      </Dialog>

      {open && (
        <Dialog open size="lg" title={open.name || open.email} description={`${open.email} · ${segLabel(open.segment)} · Marketing: ${CONSENT_LABELS[consentFor(open)]}`} onClose={() => { void closeCustomer(); }}>
          <CustomerDetail customer={open} tab={detailTab} onTab={setDetailTab} draft={draft} onDraft={setDraft}
            notesState={notesState} onRetryNotes={loadNotes} savingNote={savingNote} onSaveNote={saveNote} knownTags={allTags} onOpenOrder={() => setOpen(null)} showBookings={bookingsOn}
            packs={packs} services={servicesShop} onBookAgain={(again) => { void startBookAgain(again); }} />
        </Dialog>
      )}
      <NewsletterCard />
      <StockistsCard />
      {confirmNode}
    </div>
  );
}

/** One customer's window: Summary (with the client card when they booked) · Orders · Bookings · Notes & tags. */
export function CustomerDetail({ customer: c, tab, onTab, draft, onDraft, notesState, onRetryNotes, savingNote, onSaveNote, knownTags = [], onOpenOrder, showBookings = false, packs = [], services = false, onBookAgain }: {
  customer: CustomerRow; tab: CustomerTab; onTab: (t: CustomerTab) => void;
  draft: Draft | null; onDraft: (d: Draft) => void; notesState: "loading" | "ok" | "failed"; onRetryNotes: () => void;
  savingNote: boolean; onSaveNote: () => void; knownTags?: string[]; onOpenOrder: () => void;
  /** The shop has Bookings: a Bookings tab lists theirs. */
  showBookings?: boolean;
  /** Packs of visits sold (all clients'), for the client card's Packs left. */
  packs?: PackRow[];
  /** A services shop: the client card leads the Summary, and notes are the team's. */
  services?: boolean;
  onBookAgain?: (again: BookAgain) => void;
}) {
  const booked = c.bookings || [];
  const card = useMemo(() => clientCard(booked, packs, c.key, Date.now()), [booked, packs, c.key]);
  const phone = draft?.phone || card.phone;
  const hasCard = booked.length > 0 || (services && showBookings);
  const bookedLine = bookingsLine(booked, Date.now(), bookingDay);
  const w = useShopWords();
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "contents" }}><dt className="rp-hint">{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
  );
  return (
    <div className="rp-stack">
      <Tabs variant="page" label="Customer details" value={tab} onChange={onTab}
        tabs={[
          { id: "cust-summary", label: "Summary" },
          { id: "cust-orders", label: "Orders", count: c.orders.length },
          ...(showBookings || booked.length ? [{ id: "cust-bookings" as const, label: "Bookings", count: booked.length }] : []),
          { id: "cust-notes", label: services ? "Private notes" : "Notes & tags" },
        ]} />
      <TabPanel tabId="cust-summary" active={tab === "cust-summary"}>
        <div className="rp-stack">
          {hasCard && <ClientCardView card={card} phone={phone} email={c.email} again={card.again && onBookAgain ? () => onBookAgain({ ...card.again!, name: c.name, email: c.email, phone }) : undefined}
            bookFirst={!card.again && onBookAgain ? () => onBookAgain({ serviceId: "", staffId: "", name: c.name, email: c.email, phone }) : undefined} />}
          {hasCard && services && <ClientVisits email={c.key} />}
          {(!services || c.orderCount > 0 || !hasCard || c.segment === "moved") && <p className="rp-hint" style={{ margin: 0 }}>
            {c.segment === "moved"
              ? services ? "Brought over from your old booking tool. Their visits there are in Private notes." : "Brought over from your old shop, with no order here yet. What they bought there is in Notes & tags."
              : c.segment === "booked" ? "Booked a time with you, with no order here yet."
              : <>{c.orderCount} paid order{c.orderCount === 1 ? "" : "s"} · {money(c.totalSpent)} lifetime after refunds{c.firstOrderAt ? ` · first order ${new Date(c.firstOrderAt).toLocaleDateString()}` : ""}</>}
          </p>}
          {/* A services client who never ordered has no order facts to show: the card above says it all. */}
          {(!services || c.orderCount > 0 || !hasCard) && <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}>
            {row("Location", [c.city, c.country].filter(Boolean).join(", ") || "—")}
            {row("Avg order", c.orderCount ? money(c.avgOrder) : "—")}
            {row("Last order", c.lastOrderAt ? `${shortDate(c.lastOrderAt)} (${agoWords(c.daysSinceLast)})` : "—")}
            {(showBookings || booked.length > 0) && !hasCard && row("Bookings", bookedLine || "None yet")}
          </dl>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="rp-btn rp-btn-secondary" href={`mailto:${encodeURIComponent(c.email).replace(/%40/g, "@")}`}>{w("Email customer")}</a>
            {phone && <a className="rp-btn rp-btn-secondary" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>Call</a>}
            <SecondaryButton onClick={() => { void copyText(c.email, "Email address"); }}>Copy email</SecondaryButton>
          </div>
        </div>
      </TabPanel>
      <TabPanel tabId="cust-orders" active={tab === "cust-orders"}>
        <DataTable caption="Order history" rowKey={(o) => o.id}
          rows={c.orders}
          columns={[
            { key: "id", header: "Order", render: (o: any) => <a className="rp-mono" href={`#orders/${encodeURIComponent(o.id)}`} onClick={onOpenOrder}>{o.orderId || o.id}</a> },
            { key: "date", header: "Date", render: (o: any) => new Date(o.createdAt).toLocaleDateString() },
            { key: "status", header: "Payment", render: (o: any) => o.paymentStatus === "refunded" ? <StatusBadge tone="warning">Refunded</StatusBadge> : <StatusBadge tone="success">Paid</StatusBadge> },
            { key: "items", header: "Copies", numeric: true, render: (o: any) => copiesOf(o) },
            { key: "total", header: "Total", numeric: true, render: (o: any) => money(Number(o.total) || 0) },
          ]} />
      </TabPanel>
      {(showBookings || booked.length > 0) && (
        <TabPanel tabId="cust-bookings" active={tab === "cust-bookings"}>
          <DataTable caption="Bookings" rowKey={(b) => b.id} rows={booked} stackOnPhone
            empty={<EmptyState inline title="No bookings" description="Their times with you show here, from a year back to six months ahead." />}
            columns={[
              { key: "when", header: "When", lead: true, render: (b: Booking) => <span style={{ whiteSpace: "nowrap" }}>{bookingDay(b.start)} · {timeText(b.start, ZONE)}</span> },
              { key: "service", header: "Service", render: (b: Booking) => b.serviceName },
              { key: "status", header: "Status", render: (b: Booking) => b.status === "cancelled" ? <StatusBadge tone="neutral">Cancelled</StatusBadge>
                : b.noShow ? <StatusBadge tone="danger">No-show</StatusBadge>
                : b.status === "held" ? <StatusBadge tone="warning">Paying now</StatusBadge>
                : Date.parse(b.end) > Date.now() ? <StatusBadge tone="info">Coming up</StatusBadge> : <StatusBadge tone="success">Done</StatusBadge> },
              { key: "pay", header: "Payment", render: (b: Booking) => paymentText(b) },
            ]} />
          <p className="rp-hint" style={{ margin: "12px 0 0" }}><a href="#bookings" onClick={onOpenOrder}>Open Bookings</a> to move, cancel or add a booking.</p>
        </TabPanel>
      )}
      <TabPanel tabId="cust-notes" active={tab === "cust-notes"}>
        {draft && (
          <div className="rp-stack">
            <TextArea label={services ? "Private notes" : "Private note"} rows={services ? 6 : undefined}
              hint={services ? "For you and your team: colour formulas, session notes, what they like. Clients never see it. Ctrl (or ⌘) + Enter saves." : w("Only you can see this. Never shown to the customer. Ctrl (or ⌘) + Enter saves.")} value={draft.note} maxLength={5000}
              onChange={(e) => onDraft({ ...draft, note: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && draft.loaded && !savingNote) { e.preventDefault(); onSaveNote(); } }} />
            <TextField label="Tags" hint={services ? "Separate with commas, e.g. regular, sensitive scalp, mornings only" : w("Separate with commas, e.g. wholesale, author, festival")} value={draft.tags}
              onChange={(e) => onDraft({ ...draft, tags: e.target.value })} />
            {(services || showBookings || !!draft.phone) && (
              <TextField label="Phone" type="tel" autoComplete="off" maxLength={40} value={draft.phone} hint={!draft.phone && card.phone ? `From their bookings: ${card.phone}` : undefined}
                onChange={(e) => onDraft({ ...draft, phone: e.target.value })} />
            )}
            {(() => {
              const have = parseTags(draft.tags).map((t) => t.toLowerCase());
              const suggestions = knownTags.filter((t) => !have.includes(t.toLowerCase())).slice(0, 12);
              if (!suggestions.length) return null;
              return (
                <div role="group" aria-label="Tags you've used before" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="rp-hint">Used before:</span>
                  {suggestions.map((t) => (
                    <SecondaryButton key={t} size="sm" onClick={() => onDraft({ ...draft, tags: [...parseTags(draft.tags), t].join(", ") })}>+ {t}</SecondaryButton>
                  ))}
                </div>
              );
            })()}
            {!draft.loaded && (
              <p className="rp-hint" role="status" style={{ margin: 0 }}>
                {notesState === "failed"
                  ? <>Saved notes couldn't be loaded, so saving is off (it would replace this customer's stored note and tags).{" "}
                      <button type="button" className="rp-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", color: "inherit", font: "inherit" }} onClick={onRetryNotes}>Try again</button></>
                  : "Loading the saved note…"}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <PrimaryButton onClick={onSaveNote} disabled={savingNote || !draft.loaded}>{savingNote ? "Saving…" : "Save note"}</PrimaryButton>
            </div>
          </div>
        )}
      </TabPanel>
    </div>
  );
}

/**
 * The client card (services plan, phase 5): visits, what they spent on bookings, missed visits and the next one, then
 * the phone, saved card, packs left and their latest answers, with Book again (the last service and person).
 */
function ClientCardView({ card, phone, email, again, bookFirst }: { card: ReturnType<typeof clientCard>; phone: string; email: string; again?: () => void; bookFirst?: () => void }) {
  const currency = card.currency || SHOP_CURRENCY;
  const tile = (label: string, value: React.ReactNode, foot: React.ReactNode, flag?: "next" | "warn") => (
    <div className="cc-tile" data-next={flag === "next" || undefined} data-warn={flag === "warn" || undefined}>
      <p className="cc-kicker">{label}</p><p className="cc-value">{value}</p><p className="cc-foot">{foot}</p>
    </div>
  );
  return (
    <section className="cc" aria-label="Client card">
      <div className="cc-tiles">
        {tile("Visits", card.visits, card.lastVisit ? `Last ${bookingDay(card.lastVisit)}` : "None yet")}
        {tile("Spent", moneyText(card.spentMinor, currency), "On bookings, after refunds")}
        {tile("No-shows", card.noShows, card.cancelled ? `${card.cancelled} cancelled` : "None cancelled", card.noShows ? "warn" : undefined)}
        {tile("Next visit", card.next ? bookingDay(card.next.start) : "Not booked",
          card.next ? `${timeText(card.next.start, ZONE)} · ${card.next.serviceName}${card.next.staffName ? ` with ${card.next.staffName}` : ""}` : "Nothing coming up", "next")}
      </div>
      <dl className="cc-facts">
        <dt>Phone</dt><dd>{phone || "Not given"}</dd>
        <ClientFormFacts email={email} />
        <dt>Saved card</dt><dd>{card.card ? cardText(card.card) : "None"}</dd>
        <dt>Packs left</dt><dd>{card.packs.length
          ? card.packs.map((p) => `${p.serviceName}: ${p.left} of ${p.visits} visits${p.expiresOn ? `, until ${bookingDay(`${p.expiresOn}T12:00:00Z`)}` : ""}`).join(" · ")
          : "None"}</dd>
        {card.answers && <>
          <dt>Their answers</dt>
          <dd>
            <span className="cc-answer-when">{card.answers.serviceName} · {bookingDay(card.answers.start)}</span>
            {card.answers.list.map((a) => <span key={a.label} className="cc-answer"><strong>{/[?:.!]$/.test(a.label.trim()) ? a.label.trim() : `${a.label.trim()}:`}</strong> {a.answer}</span>)}
          </dd>
        </>}
      </dl>
      {(again || bookFirst) && (
        <div className="cc-actions">
          <PrimaryButton onClick={again || bookFirst}>{again ? "Book again" : "Book a visit"}</PrimaryButton>
        </div>
      )}
    </section>
  );
}
