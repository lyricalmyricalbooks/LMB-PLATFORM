// Admin › Gift cards: every card the shop has sold or issued, its balance and history.
// Cards are read straight from Firestore (admin-only); every change (issue, disable, adjust,
// resend) goes through the server's giftCardAdmin action, which keeps balances and history right.
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { copyText } from "./clipboard";
import {
  DataTable, DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, PrimaryButton, SearchField,
  SecondaryButton, SectionCard, StatusBadge, Tabs, TextArea, TextField, Toggle, useConfirm, type Column,
} from "./riso/components";
import {
  createdTime, dollarsToMinor, formatMinor, giftCardStatus, giftCardsCsv, historyAmount, historyLabel, historyTime, issuePayload, maskedCode, matchesGiftCard,
  type GiftCardStatus,
} from "./giftCardsAdmin";

type Filter = "all" | GiftCardStatus["key"];
const LINK = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 } as const;

const when = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—");

const copy = (text: string, what = "Code") => copyText(text, what);

function Source({ card }: { card: any }) {
  if (card.source === "order" && card.orderId) {
    return <a style={LINK} href={`#orders/${encodeURIComponent(card.orderId)}`}>Bought in order {card.orderId}</a>;
  }
  return <span>Issued by you</span>;
}

/** A failure after which the server may still have done the work: the connection dropped, timed out, or it answered with no reason. */
const outcomeUnknown = (err: any) => err instanceof TypeError || err?.name === "AbortError"
  || /network|failed to fetch|load failed|timed? ?out|couldn't be updated\.$/i.test(String(err?.message || ""));
const MAYBE_DONE = "This may have gone through — check the list before trying again.";

const EMPTY_ISSUE = { amount: "25", recipientEmail: "", recipientName: "", message: "", expiresOn: "", note: "", sendEmail: true };

function IssueDialog({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const [form, setForm] = useState({ ...EMPTY_ISSUE });
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // After a failure with an unknown outcome, Create stays off so a second click can't issue a second card.
  const [locked, setLocked] = useState(false);
  const [issued, setIssued] = useState<null | { code: string; last4: string; emailError?: string; emailed: boolean }>(null);
  const set = (k: keyof typeof EMPTY_ISSUE, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const issue = async () => {
    const built = issuePayload(form);
    if (built.ok === false) { setProblems(built.problems); return; }
    setProblems([]);
    setSaving(true);
    try {
      const result = await adminApi.giftCardAdmin("issue", built.payload);
      setIssued({ code: result.code || "", last4: result.last4 || "", emailError: result.emailError, emailed: !!built.payload.sendEmail });
      onIssued();
    } catch (err: any) {
      const unknown = outcomeUnknown(err);
      if (unknown) { setLocked(true); onIssued(); }
      setProblems([`${err?.message || "The gift card couldn't be created."}${unknown ? ` ${MAYBE_DONE}` : ""}`]);
    } finally {
      setSaving(false);
    }
  };

  if (issued) {
    return (
      <Dialog open onClose={onClose} title="Gift card created" badge="🎁"
        description="Copy the code now if you're passing it on yourself. You can see it again any time: open the card from the Gift cards list."
        footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="rp-stack" style={{ gap: 12 }}>
          <p className="rp-mono" style={{ fontSize: "var(--rp-text-xl)", margin: 0, overflowWrap: "anywhere" }} aria-label={`Gift card code ${issued.code.split("").join(" ")}`}>{issued.code}</p>
          <div><SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={() => copy(issued.code)}>Copy code</SecondaryButton></div>
          {issued.emailed && !issued.emailError && <p className="rp-hint" role="status">The code was emailed to the recipient.</p>}
          {issued.emailError && <p className="rp-error-text" role="alert">The card was created, but the email couldn't be sent: {issued.emailError} Use “Resend email” on the card once the problem is fixed.</p>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Issue a gift card" badge="🎁" size="lg"
      description="Create a gift card yourself — for a prize, a refund as store credit or a goodwill gesture. It works at checkout like a bought one."
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={issue} disabled={saving || locked}>{saving ? "Creating…" : "Create gift card"}</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 16 }}>
        {problems.length > 0 && (
          <div role="alert" className="rp-error-text">
            <strong>{locked ? "Something went wrong:" : `Fix ${problems.length === 1 ? "this" : "these"} first:`}</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <TextField label="Amount (CA$)" type="number" min={1} max={10000} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} data-autofocus hint="Between CA$1 and CA$10,000." />
          <TextField label="Expiry date (optional)" type="date" value={form.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} hint="Leave blank so it never expires. Check your province's gift card rules first." />
          <TextField label="Recipient's name (optional)" value={form.recipientName} maxLength={100} onChange={(e) => set("recipientName", e.target.value)} />
          <TextField label="Recipient's email (optional)" type="email" value={form.recipientEmail} maxLength={320} onChange={(e) => set("recipientEmail", e.target.value)} />
        </div>
        <TextArea label="Message to the recipient (optional)" rows={3} maxLength={300} value={form.message} onChange={(e) => set("message", e.target.value)} hint="Shown in the gift card email. Up to 300 characters." />
        <TextField label="Internal note (optional)" maxLength={500} value={form.note} onChange={(e) => set("note", e.target.value)} hint="Only you see this, e.g. “Poetry night raffle prize”." />
        <Toggle label="Email the code to the recipient" checked={form.sendEmail} onChange={(v) => set("sendEmail", v)} />
        <p className="rp-hint" style={{ margin: 0 }}>Uses the “Gift card” email in Settings › Email sender.</p>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ card, onClose, onDone }: { card: any; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const delta = dollarsToMinor(amount);
  const after = Number.isFinite(delta) ? Math.max(0, (Number(card.balanceMinor) || 0) + delta) : null;
  const save = async () => {
    if (!Number.isFinite(delta) || !delta) { setError("Enter an amount to add, or a minus amount (e.g. -10) to remove."); return; }
    if (!reason.trim()) { setError("Add a reason — it is kept in the card's history."); return; }
    setSaving(true); setError("");
    try {
      const result = await adminApi.giftCardAdmin("adjust", { id: card.id, deltaMinor: delta, reason: reason.trim() });
      toast.success(result.clamped
        ? `Only ${formatMinor(Math.abs(result.appliedMinor || 0))} could be ${(result.appliedMinor || 0) < 0 ? "removed" : "added"}. Balance is now ${formatMinor(result.balanceMinor)}`
        : `Balance is now ${formatMinor(result.balanceMinor)}`);
      onDone();
    } catch (err: any) {
      const unknown = outcomeUnknown(err);
      if (unknown) setLocked(true);
      setError(`${err?.message || "The balance couldn't be changed."}${unknown ? ` ${MAYBE_DONE}` : ""}`);
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Adjust balance · ${maskedCode(card)}`}
      description={`Current balance ${formatMinor(card.balanceMinor)}. The balance never goes below $0.`}
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={saving || locked}>{saving ? "Saving…" : "Save adjustment"}</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 16 }}>
        <TextField label="Amount to add (CA$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus
          hint={after !== null && delta ? `New balance: ${formatMinor(after)}. Use a minus sign to remove money, e.g. -10.` : "Use a minus sign to remove money, e.g. -10."} />
        <TextField label="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer paid part in cash" />
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
      </div>
    </Dialog>
  );
}

function ResendDialog({ card, onClose, onDone }: { card: any; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const send = async () => {
    const address = to.trim().toLowerCase();
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) { setError("Check the email address."); return; }
    if (!address && !card.recipientEmail) { setError("This card has no recipient email. Enter an address to send it to."); return; }
    setSaving(true); setError("");
    try {
      await adminApi.giftCardAdmin("resend", { id: card.id, ...(address ? { to: address } : {}) });
      toast.success(`Gift card emailed to ${address || card.recipientEmail}`);
      onDone();
    } catch (err: any) {
      const unknown = outcomeUnknown(err);
      if (unknown) setLocked(true);
      setError(`${err?.message || "The email couldn't be sent."}${unknown ? ` ${MAYBE_DONE}` : ""}`);
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Resend email · ${maskedCode(card)}`}
      description={card.recipientEmail ? `Sends the gift card email to ${card.recipientEmail} again, or to another address below.` : "Enter the address to send the gift card email to."}
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={send} disabled={saving || locked}>{saving ? "Sending…" : "Send email"}</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <TextField label={card.recipientEmail ? "Send to a different address (optional)" : "Send to"} type="email" value={to} onChange={(e) => setTo(e.target.value)} data-autofocus />
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
      </div>
    </Dialog>
  );
}

function ExpiryDialog({ card, onClose, onDone }: { card: any; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(String(card.expiresOn || ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (expiresOn: string) => {
    setSaving(true); setError("");
    try {
      await adminApi.giftCardAdmin("setExpiry", { id: card.id, expiresOn, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast.success(expiresOn ? `Card now expires ${day(expiresOn)}` : "Card no longer expires");
      onDone();
    } catch (err: any) {
      setError(err?.message || "The expiry couldn't be changed.");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Change expiry · ${maskedCode(card)}`}
      description={card.expiresOn ? `Currently expires ${day(card.expiresOn)}. Check your province's gift card rules before shortening it.` : "This card never expires right now."}
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        {card.expiresOn && <SecondaryButton disabled={saving} onClick={() => save("")}>Remove expiry</SecondaryButton>}
        <PrimaryButton disabled={saving || !date} onClick={() => save(date)}>{saving ? "Saving…" : "Save expiry"}</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <TextField label="Expires on" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-autofocus hint="Last day the card works (shop time, Toronto)." />
        <TextField label="Reason (optional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Extended as a courtesy" hint="Kept in the card's history." />
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
      </div>
    </Dialog>
  );
}

function CardDrawer({ card, onClose, onChanged }: { card: any; onClose: () => void; onChanged: () => void }) {
  const [ask, confirmNode] = useConfirm();
  const [sub, setSub] = useState<null | "adjust" | "resend" | "expiry">(null);
  const [busy, setBusy] = useState(false);
  const status = giftCardStatus(card);
  const history = [...(Array.isArray(card.history) ? card.history : [])].sort((a, b) => historyTime(b) - historyTime(a));

  const setEnabled = async (enabled: boolean) => {
    if (!enabled && !(await ask({ title: "Disable this gift card?", message: `${maskedCode(card)} (${formatMinor(card.balanceMinor)} left) will stop working at checkout until you enable it again. The balance is kept.`, confirmLabel: "Disable gift card" }))) return;
    setBusy(true);
    try {
      await adminApi.giftCardAdmin("setEnabled", { id: card.id, enabled });
      toast.success(enabled ? "Gift card enabled" : "Gift card disabled");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || "The gift card couldn't be updated.");
    } finally { setBusy(false); }
  };

  const facts: Array<[string, React.ReactNode]> = [
    ["Balance", <strong key="b">{formatMinor(card.balanceMinor)} <span className="rp-hint">of {formatMinor(card.initialMinor)}</span></strong>],
    ["Status", <StatusBadge key="s" tone={status.tone}>{status.label}</StatusBadge>],
    ["Recipient", [card.recipientName, card.recipientEmail].filter(Boolean).join(" · ") || "—"],
    ["From", card.senderName || card.purchaserEmail || "—"],
    ["Source", <Source key="src" card={card} />],
    ["Expires", card.expiresOn ? day(card.expiresOn) : "Never"],
    ["Created", when(createdTime(card))],
    ...(card.emailedAt ? [["Last emailed", when(Date.parse(card.emailedAt))] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      <Drawer open onClose={onClose} title={`Gift card ${maskedCode(card)}`} description={card.isTest ? "Test card — only works while payments are in test mode." : undefined}
        footerStart={card.enabled === false
          ? <SecondaryButton disabled={busy} onClick={() => setEnabled(true)}>Enable</SecondaryButton>
          : <DestructiveButton disabled={busy} onClick={() => setEnabled(false)}>Disable</DestructiveButton>}
        footer={<>
          <SecondaryButton disabled={busy} onClick={() => setSub("expiry")}>Change expiry</SecondaryButton>
          <SecondaryButton disabled={busy} onClick={() => setSub("resend")}>Resend email</SecondaryButton>
          <PrimaryButton disabled={busy} onClick={() => setSub("adjust")}>Adjust balance</PrimaryButton>
        </>}>
        <div className="rp-stack" style={{ gap: 20 }}>
          <div>
            <span className="rp-label">Full code</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
              <span className="rp-mono" style={{ fontSize: "var(--rp-text-lg)", overflowWrap: "anywhere" }}>{card.code || "—"}</span>
              {card.code && <SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={() => copy(card.code)}>Copy</SecondaryButton>}
            </div>
          </div>
          <dl style={{ margin: 0, display: "grid", gap: 10 }}>
            {facts.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <dt className="rp-hint">{k}</dt><dd style={{ margin: 0, textAlign: "right" }}>{v}</dd>
              </div>
            ))}
          </dl>
          {card.message && <div><span className="rp-label">Message</span><blockquote style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{card.message}”</blockquote></div>}
          {card.note && <div><span className="rp-label">Internal note</span><p style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>{card.note}</p></div>}
          <div>
            <span className="rp-label">History</span>
            {history.length === 0 ? <p className="rp-hint">Nothing recorded yet.</p> : (
              <ol style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
                {history.map((h, i) => (
                  <li key={i} style={{ borderTop: "1px solid var(--rp-divider)", paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{historyLabel(h.type)}</strong>
                      {historyAmount(h) ? <span className="rp-mono">{historyAmount(h)}</span> : null}
                    </div>
                    <div className="rp-hint">
                      {when(historyTime(h))}
                      {h.orderId ? <> · <a style={LINK} href={`#orders/${encodeURIComponent(h.orderId)}`}>Order {h.orderId}</a></> : null}
                      {h.actor ? ` · ${h.actor}` : ""}
                    </div>
                    {h.reason && <div style={{ overflowWrap: "anywhere" }}>{h.reason}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Drawer>
      {sub === "adjust" && <AdjustDialog card={card} onClose={() => setSub(null)} onDone={() => { setSub(null); onChanged(); }} />}
      {sub === "expiry" && <ExpiryDialog card={card} onClose={() => setSub(null)} onDone={() => { setSub(null); onChanged(); }} />}
      {sub === "resend" && <ResendDialog card={card} onClose={() => setSub(null)} onDone={() => { setSub(null); onChanged(); }} />}
      {confirmNode}
    </>
  );
}

export function GiftCards({ openId, onOpened }: { openId?: string | null; onOpened?: () => void }) {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(openId || null);
  const [issuing, setIssuing] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      const list = await adminApi.getGiftCards();
      setCards(list.sort((a, b) => createdTime(b) - createdTime(a)));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  // Links such as /admin#gift-cards/<id> (from an order) open that card.
  useEffect(() => { if (openId) { setSelectedId(openId); onOpened?.(); } }, [openId]);

  const refreshOne = async (id: string) => {
    try {
      const fresh = await adminApi.getGiftCard(id);
      if (fresh) setCards((list) => list.map((c) => (c.id === id ? fresh : c)));
    } catch { load(); }
  };

  const withStatus = useMemo(() => cards.map((c) => ({ card: c, status: giftCardStatus(c) })), [cards]);
  const counts = useMemo(() => withStatus.reduce((acc, { status }) => { acc[status.key] += 1; return acc; }, { active: 0, used: 0, disabled: 0, expired: 0, test: 0 } as Record<GiftCardStatus["key"], number>), [withStatus]);
  const rows = withStatus.filter(({ card, status }) => (filter === "all" || status.key === filter) && matchesGiftCard(card, search));
  const outstanding = withStatus.filter(({ status }) => status.key === "active").reduce((sum, { card }) => sum + (Number(card.balanceMinor) || 0), 0);
  const sold = withStatus.filter(({ card, status }) => status.key !== "test" && card.source === "order").reduce((sum, { card }) => sum + (Number(card.initialMinor) || 0), 0);
  const selected = cards.find((c) => c.id === selectedId) || null;

  const columns: Column<{ card: any; status: GiftCardStatus }>[] = [
    { key: "code", header: "Card", lead: true, render: ({ card }) => (
      <button type="button" className="rp-row-link rp-mono" style={{ whiteSpace: "nowrap" }}
        onClick={() => setSelectedId(card.id)} aria-label={`Open gift card ending ${card.last4}`}>{maskedCode(card)}</button>
    ) },
    { key: "status", header: "Status", render: ({ status }) => <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></span> },
    { key: "balance", header: "Balance / initial", numeric: true, render: ({ card }) => <span style={{ whiteSpace: "nowrap" }}>{formatMinor(card.balanceMinor)} <span className="rp-hint">/ {formatMinor(card.initialMinor)}</span></span> },
    { key: "recipient", header: "Recipient", render: ({ card }) => <span style={{ overflowWrap: "anywhere", display: "inline-block", minWidth: 140 }}>{card.recipientName || card.recipientEmail ? [card.recipientName, card.recipientEmail].filter(Boolean).join(" · ") : "—"}</span> },
    { key: "source", header: "Source", render: ({ card }) => <Source card={card} /> },
    { key: "created", header: "Created", render: ({ card }) => <span style={{ whiteSpace: "nowrap" }}>{when(createdTime(card))}</span> },
  ];

  if (loading) return <LoadingState label="Loading gift cards…" />;
  if (failed) return <ErrorState description="Gift cards could not be loaded. If this is the first time, the gift card rules may not be deployed yet." onRetry={() => { setLoading(true); load(); }} />;

  const exportCsv = async (fullCodes: boolean) => {
    if (fullCodes && !(await ask({ title: "Export with full codes?", message: "Anyone who gets this file can spend these gift cards. Keep it private and delete it when you're done.", confirmLabel: "Export full codes" }))) return;
    try {
      const url = URL.createObjectURL(new Blob([giftCardsCsv(rows.map((r) => r.card), { fullCodes })], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `gift-cards${fullCodes ? "-full-codes" : ""}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("The file couldn't be created."); }
  };

  const issueButton = <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setIssuing(true)}>Issue gift card</PrimaryButton>;

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <MetricCard label="Active cards" value={counts.active} footer={`${cards.length} in total`} />
        <MetricCard label="Balance outstanding" value={formatMinor(outstanding)} footer="Still to be spent on active cards" />
        <MetricCard label="Sold in the shop" value={formatMinor(sold)} footer="Face value of cards bought by shoppers" />
      </div>
      {cards.length === 0 ? (
        <SectionCard>
          <EmptyState icon="🎁" title="No gift cards yet"
            description="Cards appear here when a shopper buys a gift-card product (Books › add a book › Product type: Gift card) or when you issue one yourself."
            action={issueButton} />
        </SectionCard>
      ) : (
        <>
          <Tabs label="Gift card status" value={filter} onChange={(id) => setFilter(id as Filter)} tabs={[
            { id: "all", label: "All", count: cards.length },
            { id: "active", label: "Active", count: counts.active },
            { id: "used", label: "Used up", count: counts.used },
            { id: "disabled", label: "Disabled", count: counts.disabled },
            { id: "expired", label: "Expired", count: counts.expired },
            { id: "test", label: "Test", count: counts.test },
          ]} />
          <FilterBar>
            <div className="rp-grow"><SearchField label="Search gift cards" placeholder="Search by code, last 4 characters or email…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={() => setExporting(true)}>Export CSV</SecondaryButton>
            {issueButton}
          </FilterBar>
          <SectionCard flush collapsible={false} title="Gift cards" description={`${rows.length} of ${cards.length}. Open one to see its code, change it or resend it.`}>
            <DataTable caption="Gift cards" columns={columns} rows={rows} rowKey={(r) => r.card.id} onRowClick={(r) => setSelectedId(r.card.id)}
              empty={<EmptyState title="No gift cards match" description="Try a different status or search."
                action={<SecondaryButton onClick={() => { setFilter("all"); setSearch(""); }}>Reset filters</SecondaryButton>} />} />
          </SectionCard>
        </>
      )}
      {selected && <CardDrawer key={selected.id} card={selected} onClose={() => setSelectedId(null)} onChanged={() => refreshOne(selected.id)} />}
      {selectedId && !selected && !loading && (
        <Dialog open onClose={() => setSelectedId(null)} title="Gift card not found" footer={<PrimaryButton onClick={() => setSelectedId(null)}>Close</PrimaryButton>}>
          <p className="rp-card-desc" style={{ margin: 0 }}>That gift card isn't in the list. It may still be being created — reload in a moment.</p>
        </Dialog>
      )}
      {exporting && (
        <Dialog open onClose={() => setExporting(false)} title="Export gift cards"
          description={`${rows.length} card${rows.length === 1 ? "" : "s"} in the current view.`}
          footer={<>
            <SecondaryButton onClick={() => { setExporting(false); void exportCsv(true); }}>With full codes…</SecondaryButton>
            <PrimaryButton icon={<Download size={16} aria-hidden />} onClick={() => { setExporting(false); void exportCsv(false); }}>Download (codes hidden)</PrimaryButton>
          </>}>
          <p className="rp-card-desc" style={{ margin: 0 }}>The usual file hides each code except its last 4 characters, which is enough for bookkeeping. Choose full codes only if you need to hand the cards out yourself: anyone with that file can spend them.</p>
        </Dialog>
      )}
      {issuing && <IssueDialog onClose={() => setIssuing(false)} onIssued={load} />}
      {confirmNode}
    </div>
  );
}
