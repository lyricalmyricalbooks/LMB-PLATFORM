import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { copyText } from "./clipboard";
import { getOrdersCached } from "./ordersCache";
import {
  buildCustomers, consentOf, copiesOf, customerCountries, customerStats, customersToCsv, parseTags, CONSENT_LABELS, SEGMENT_LABELS,
  type Consent, type CustomerRow, type CustomerSegment,
} from "./customerInsights";
import {
  DataTable, Dialog, EmptyState, ErrorState, FilterBar, GhostButton, LoadingState, MetricCard, Pagination, PrimaryButton, SearchField,
  SecondaryButton, SectionCard, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, useConfirm, type BadgeTone, type Column,
} from "./riso/components";

const money = (n: number) => `CA$${n.toFixed(2)}`;
const TONE: Record<CustomerSegment, BadgeTone> = { vip: "primary", "vip-lapsed": "danger", returning: "success", new: "info", "at-risk": "warning" };
const CONSENT_TONE: Record<Consent, BadgeTone> = { subscribed: "success", "opted-out": "danger", none: "neutral" };
const PAGE_SIZE = 25;
type Note = { note: string; tags: string[] };
type Draft = { note: string; tags: string; loaded: boolean };
/** Sub tabs of one customer's window. Ids are prefixed: `Tabs` renders `id="rp-tab-<id>"` and the segment tabs use plain ids. */
export type CustomerTab = "cust-summary" | "cust-orders" | "cust-notes";
const shortDate = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** sha256 hex of the lowercased email: the id of `customerNotes` and `marketing-optout` docs. */
export async function emailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(String(email || "").trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const [consent, setConsent] = useState<{ subscribed: Set<string>; optedOutHashes: Set<string> | null } | null>(null);
  const [hashes, setHashes] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  // loaded: the stored note for this customer was read, so saving can't replace it with blanks.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notesState, setNotesState] = useState<"loading" | "ok" | "failed">("loading");
  const [savingNote, setSavingNote] = useState(false);
  const [ask, confirmNode] = useConfirm();

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
  }, []);
  const loadNotes = () => {
    setNotesState("loading");
    adminApi.listCustomerNotes()
      .then((rows) => { setNotes(new Map(rows.map((r) => [r.id, { note: r.note || "", tags: r.tags || [] }]))); setNotesState("ok"); })
      .catch((e) => { console.error(e); setNotesState("failed"); });
  };

  const all = useMemo(() => buildCustomers(orders), [orders]);
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
    const c: Record<string, number> = { all: all.length, vip: 0, "vip-lapsed": 0, returning: 0, new: 0, "at-risk": 0 };
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
    setDraft({ note: n?.note || "", tags: (n?.tags || []).join(", "), loaded: notesReadyFor(c) });
  };
  // Notes (or the customer's id) arrived after the panel opened: show the stored note before allowing a save.
  useEffect(() => {
    if (!open || !draft || draft.loaded || !notesReadyFor(open)) return;
    const n = noteFor(open);
    setDraft({ note: n?.note || "", tags: (n?.tags || []).join(", "), loaded: true });
  }, [open, draft, notesState, hashes, notes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing with an unsaved note asks first, so typed notes are never dropped by accident.
  const noteChanged = () => {
    if (!open || !draft || !draft.loaded) return false;
    const n = noteFor(open);
    return draft.note !== (n?.note || "") || parseTags(draft.tags).join(",") !== (n?.tags || []).join(",");
  };
  const closeCustomer = async () => {
    if (noteChanged() && !(await ask({ title: "Discard your note changes?", message: "The private note or tags for this customer have changes that aren't saved.", confirmLabel: "Discard changes" }))) return;
    setOpen(null);
  };
  const saveNote = async () => {
    if (!open || !draft || !draft.loaded) return;
    const id = hashes.get(open.key) || await emailHash(open.key);
    const data = { email: open.key, note: draft.note.slice(0, 5000), tags: parseTags(draft.tags) };
    setSavingNote(true);
    try {
      await adminApi.saveCustomerNote(id, data);
      setNotes((m) => new Map(m).set(id, { note: data.note, tags: data.tags }));
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
    { key: "segment", header: "Segment", render: (c) => <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={TONE[c.segment]}>{SEGMENT_LABELS[c.segment]}</StatusBadge></span> },
    { key: "consent", header: "Marketing", render: (c) => consent ? <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={CONSENT_TONE[consentFor(c)]}>{CONSENT_LABELS[consentFor(c)]}</StatusBadge></span> : "—" },
    { key: "location", header: "Location", render: (c) => [c.city, c.country].filter(Boolean).join(", ") || "—" },
    { key: "orders", header: "Orders", numeric: true, render: (c) => c.orderCount },
    { key: "spent", header: "Net spent", numeric: true, render: (c) => money(c.totalSpent) },
    { key: "aov", header: "Avg order", numeric: true, render: (c) => money(c.avgOrder) },
    { key: "last", header: "Last order", render: (c) => !c.lastOrderAt ? "—" : <span style={{ whiteSpace: "nowrap" }}>{`${new Date(c.lastOrderAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} (${c.daysSinceLast}d ago)`}</span> },
  ];

  if (loading) return <LoadingState label="Loading customers…" />;
  if (failed) return <ErrorState title="Customers could not be loaded" onRetry={() => load(true)} />;

  return (
    <div className="rp-stack">
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
        ]} />
      <FilterBar>
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
        {filtered && <GhostButton onClick={clearFilters}>Clear filters</GhostButton>}
        <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={() => setExportOpen(true)}>Export CSV</SecondaryButton>
      </FilterBar>
      <SectionCard flush collapsible={false} title="Customers" description={`${rows.length} customer${rows.length === 1 ? "" : "s"} · paid orders only, refunds taken off.`}>
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
        <Dialog open size="lg" title={open.name || open.email} description={`${open.email} · ${SEGMENT_LABELS[open.segment]} · Marketing: ${CONSENT_LABELS[consentFor(open)]}`} onClose={() => { void closeCustomer(); }}>
          <CustomerDetail customer={open} tab={detailTab} onTab={setDetailTab} draft={draft} onDraft={setDraft}
            notesState={notesState} onRetryNotes={loadNotes} savingNote={savingNote} onSaveNote={saveNote} knownTags={allTags} onOpenOrder={() => setOpen(null)} />
        </Dialog>
      )}
      {confirmNode}
    </div>
  );
}

/** One customer's window: Summary · Orders · Notes & tags. */
export function CustomerDetail({ customer: c, tab, onTab, draft, onDraft, notesState, onRetryNotes, savingNote, onSaveNote, knownTags = [], onOpenOrder }: {
  customer: CustomerRow; tab: CustomerTab; onTab: (t: CustomerTab) => void;
  draft: Draft | null; onDraft: (d: Draft) => void; notesState: "loading" | "ok" | "failed"; onRetryNotes: () => void;
  savingNote: boolean; onSaveNote: () => void; knownTags?: string[]; onOpenOrder: () => void;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "contents" }}><dt className="rp-hint">{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
  );
  return (
    <div className="rp-stack">
      <Tabs variant="page" label="Customer details" value={tab} onChange={onTab}
        tabs={[
          { id: "cust-summary", label: "Summary" },
          { id: "cust-orders", label: "Orders", count: c.orders.length },
          { id: "cust-notes", label: "Notes & tags" },
        ]} />
      <TabPanel tabId="cust-summary" active={tab === "cust-summary"}>
        <div className="rp-stack">
          <p className="rp-hint" style={{ margin: 0 }}>
            {c.orderCount} paid order{c.orderCount === 1 ? "" : "s"} · {money(c.totalSpent)} lifetime after refunds{c.firstOrderAt ? ` · first order ${new Date(c.firstOrderAt).toLocaleDateString()}` : ""}
          </p>
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}>
            {row("Location", [c.city, c.country].filter(Boolean).join(", ") || "—")}
            {row("Avg order", money(c.avgOrder))}
            {row("Last order", c.lastOrderAt ? `${shortDate(c.lastOrderAt)} (${c.daysSinceLast}d ago)` : "—")}
          </dl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="rp-btn rp-btn-secondary" href={`mailto:${encodeURIComponent(c.email).replace(/%40/g, "@")}`}>Email customer</a>
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
      <TabPanel tabId="cust-notes" active={tab === "cust-notes"}>
        {draft && (
          <div className="rp-stack">
            <TextArea label="Private note" hint="Only you can see this. Never shown to the customer. Ctrl (or ⌘) + Enter saves." value={draft.note} maxLength={5000}
              onChange={(e) => onDraft({ ...draft, note: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && draft.loaded && !savingNote) { e.preventDefault(); onSaveNote(); } }} />
            <TextField label="Tags" hint="Separate with commas, e.g. wholesale, author, festival" value={draft.tags}
              onChange={(e) => onDraft({ ...draft, tags: e.target.value })} />
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
