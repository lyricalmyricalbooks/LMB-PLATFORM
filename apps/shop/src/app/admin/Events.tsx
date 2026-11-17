// Admin › Events (beta, 17 November 2026; tasks/todo/2026-11-17-events-tickets-e1.md). The shop's events, their
// tickets and who is coming, in the Colophon bento look (bookings.css tiles + events.css, tokens only). Shown only when
// Events is on for the shop (the platform's switch and the owner's, Dashboard.tsx). Events, places and ticket orders
// are server-only records, so every read and change goes through the server (eventsApi.ts): it never sells one place twice.
// The guest list is also the door (E2): type or scan a ticket's code and the server marks it used, once.
// Each order can be refunded from the list (E3): the server sends the money back and puts the places on sale again.
// Or moved to another event: same ticket codes, no money moves, the guest gets an email with the new date.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CalendarPlus, Check, Download, ImagePlus, Mail, Pencil, Plus, ScanLine, Ticket, Trash2, Undo2, Users } from "lucide-react";
import toast from "react-hot-toast";
import {
  Checkbox, DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SelectField,
  StatusBadge, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { eventsAdmin, type AdminEvent, type CancelAnswer, type DoorAnswer, type MoveAnswer, type RefundAnswer, type TicketOrder } from "./eventsApi";
import {
  arrivedCount, blankExtra, blankForm, blankTicket, extrasText, countsOfCodes, eventFigures, eventFromForm, eventState, findGuests, formFromEvent, guestCsv, moneyText, soldLine, splitEvents, STATE_WORDS,
  whenParts, withOrderChanged, withTicketUsed,
  type EventForm, type ExtraForm, type TicketForm,
} from "./eventsView";
import { cleanTicketCode, MAX_EXTRAS, MAX_TICKET_KINDS, moveKinds, refundMinorFor, type EventStatus } from "../../shared/eventTickets";
import { ScanBarcodeButton } from "./ScanBarcodeButton";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { saveFile } from "./xlsxWriter";
import "./bookings.css";
import "./events.css";

type ListAnswer = { zone: string; currency: string; events: AdminEvent[] };
const STATUS_CHOICES: { id: EventStatus; label: string; hint: string }[] = [
  { id: "draft", label: "Draft", hint: "Only you can see it." },
  { id: "live", label: "On sale", hint: "People can buy tickets until it starts." },
  { id: "cancelled", label: "Cancelled", hint: "No more tickets are sold. To refund everyone as well, open Who's coming and press Cancel event." },
];
const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Events() {
  const [data, setData] = useState<ListAnswer | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"coming" | "past">("coming");
  const [form, setForm] = useState<EventForm | null>(null);
  const [guestsOf, setGuestsOf] = useState<{ event: AdminEvent; door: boolean } | null>(null);
  // "Now" is read once per load, so the lists don't shuffle while the owner reads them.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const reload = () => eventsAdmin<ListAnswer>("list")
    .then((answer) => { setData(answer); setNowMs(Date.now()); setError(""); })
    .catch((err) => setError(problemOf(err, "Your events didn't load.")));
  useEffect(() => { void reload(); }, []);

  const zone = data?.zone || shopTimeZone();
  const currency = data?.currency || SHOP_CURRENCY;
  const lists = useMemo(() => splitEvents(data?.events || [], nowMs), [data, nowMs]);
  const figures = useMemo(() => eventFigures(data?.events || [], nowMs), [data, nowMs]);

  if (error && !data) return <ErrorState title="Your events didn't load" description={error} onRetry={() => { void reload(); }} />;
  if (!data) return <LoadingState label="Opening your events…" />;

  const shown = tab === "coming" ? lists.coming : lists.past;
  const next = figures.next;
  const nextWhen = next ? whenParts(next.start, zone) : null;
  const startNew = () => setForm(blankForm(zone, Date.now()));

  return (
    <div className="bkg-page evt-page">
      <PageActions>
        <PrimaryButton icon={<CalendarPlus size={16} aria-hidden />} onClick={startNew}>New event</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Events is new. Tell us what would make it better from Help.</span>
      </div>

      <section className="bkg-bento evt-bento" aria-label="At a glance">
        <div className="bkg-tile bkg-tile-mint">
          <p className="bkg-kicker">Next event</p>
          {next && nextWhen ? (
            <button type="button" className="bkg-next-body" onClick={() => setGuestsOf({ event: next, door: false })}>
              <span className="bkg-next-when">{nextWhen.weekday} {nextWhen.day} {nextWhen.month}<span>{nextWhen.time}</span></span>
              <span className="bkg-next-who">{next.title}</span>
              <span className="bkg-next-what">{soldLine(next).text}{next.venue ? ` · ${next.venue}` : ""}</span>
            </button>
          ) : (
            <div className="bkg-next-body">
              <span className="bkg-next-who">Nothing coming up</span>
              <span className="bkg-next-what">Add an event and put its tickets on sale.</span>
            </div>
          )}
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">Tickets sold</p>
          <p className="bkg-big">{figures.sold}</p>
          <p className="bkg-sub">{figures.places ? `of ${figures.places} for coming events` : "for coming events"}</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">Money taken</p>
          <p className="bkg-big bkg-big-money">{moneyText(figures.paidMinor, currency)}</p>
          <p className="bkg-sub">from tickets, all events</p>
        </div>
        <div className="bkg-tile bkg-tile-ink">
          <p className="bkg-kicker">On sale now</p>
          <p className="bkg-big">{figures.onSale}</p>
          <p className="bkg-sub evt-on-ink">{figures.onSale === 1 ? "event" : "events"}</p>
        </div>
      </section>

      <Tabs label="Events" value={tab} onChange={setTab} tabs={[
        { id: "coming", label: "Coming", count: lists.coming.length },
        { id: "past", label: "Past", count: lists.past.length },
      ]} />

      {shown.length === 0 ? (
        <div className="bkg-tile">
          {tab === "coming"
            ? <EmptyState icon={<Ticket size={24} aria-hidden />} title="No events coming up" description="A reading, a launch, a workshop, a market day: add it here and sell tickets for it."
              action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={startNew}>New event</PrimaryButton>} />
            : <EmptyState icon={<Ticket size={24} aria-hidden />} title="No past events yet" description="Events that are over or cancelled are kept here, with who came." />}
        </div>
      ) : (
        <ul className="evt-list" aria-label={tab === "coming" ? "Coming events" : "Past events"}>
          {shown.map((event) => <EventRow key={event.id} event={event} zone={zone} currency={currency} nowMs={nowMs}
            onEdit={() => setForm(formFromEvent(event, zone))} onGuests={(door) => setGuestsOf({ event, door })} />)}
        </ul>
      )}

      {form && <EventEditor key={form.id || "new"} start={form} zone={zone} sold={data.events.find((e) => e.id === form.id)?.sold || {}}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload(); }} />}
      {guestsOf && <GuestList event={guestsOf.event} door={guestsOf.door} zone={zone} currency={currency}
        others={lists.coming.filter((e) => e.id !== guestsOf.event.id && e.status !== "cancelled")} onClose={() => { setGuestsOf(null); void reload(); }} />}
    </div>
  );
}

function EventRow({ event, zone, currency, nowMs, onEdit, onGuests }: { event: AdminEvent; zone: string; currency: string; nowMs: number; onEdit: () => void; onGuests: (door: boolean) => void }) {
  const when = whenParts(event.start, zone);
  const state = eventState(event, nowMs);
  const sold = soldLine(event);
  return (
    <li className="bkg-tile evt-row">
      <div className="evt-date" aria-hidden="true"><span>{when.month}</span><strong>{when.day}</strong></div>
      <div className="evt-main">
        <div className="evt-title-line">
          <h3 className="evt-title">{event.title}</h3>
          <StatusBadge tone={STATE_WORDS[state].tone}>{STATE_WORDS[state].label}</StatusBadge>
        </div>
        <p className="evt-when">{when.weekday} {when.day} {when.month}, {when.time}{event.venue ? ` · ${event.venue}` : event.onlineUrl ? " · Online" : ""}</p>
        <div className="evt-sold">
          <div className="evt-bar" role="img" aria-label={sold.text}><i style={{ width: `${sold.percent}%` }} /></div>
          <span>{sold.text}{event.paidMinor ? ` · ${moneyText(event.paidMinor, currency)}` : ""}{event.arrived ? ` · ${event.arrived} arrived` : ""}</span>
        </div>
      </div>
      <div className="evt-actions">
        {event.status === "live" && event.soldTotal > 0 && <SecondaryButton icon={<ScanLine size={16} aria-hidden />} onClick={() => onGuests(true)}>At the door</SecondaryButton>}
        <SecondaryButton icon={<Users size={16} aria-hidden />} onClick={() => onGuests(false)}>Who's coming</SecondaryButton>
        <GhostButton icon={<Pencil size={16} aria-hidden />} onClick={onEdit}>Edit</GhostButton>
      </div>
    </li>
  );
}

function EventEditor({ start, zone, sold, onClose, onSaved }: { start: EventForm; zone: string; sold: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [ask, confirmNode] = useConfirm();
  const set = (patch: Partial<EventForm>) => { setForm((f) => ({ ...f, ...patch })); setProblem(""); };
  const setTicket = (id: string, patch: Partial<TicketForm>) => set({ tickets: form.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const setExtra = (id: string, patch: Partial<ExtraForm>) => set({ extras: form.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const soldAny = Object.values(sold).some((n) => n > 0);

  const save = async () => {
    const made = eventFromForm(form, zone);
    if ("problem" in made) { setProblem(made.problem); return; }
    setBusy(true);
    try {
      await eventsAdmin("saveEvent", { event: made.event });
      toast.success(form.status === "live" ? "Saved. Tickets are on sale." : "Saved.");
      onSaved();
    } catch (err) { setProblem(problemOf(err, "That didn't save. Check your connection and try again.")); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await ask({ title: "Delete this event?", message: `"${form.title || "This event"}" will be gone for good.`, confirmLabel: "Delete event" }))) return;
    setBusy(true);
    try { await eventsAdmin("deleteEvent", { id: form.id }); toast.success("Event deleted."); onSaved(); }
    catch (err) { setProblem(problemOf(err, "That didn't delete. Try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title={form.id ? "Edit event" : "New event"} size="lg"
      footerStart={form.id && !soldAny ? <DestructiveButton icon={<Trash2 size={16} aria-hidden />} onClick={() => { void remove(); }} disabled={busy}>Delete</DestructiveButton> : undefined}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>Save event</PrimaryButton></>}>
      <div className="evt-form">
        <TextField label="Name" value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Autumn launch party" />
        <TextArea label="About it" rows={4} value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />
        <div className="evt-grid-3">
          <TextField label="Date" type="date" value={form.day} onChange={(e) => set({ day: e.target.value })} />
          <TextField label="Starts" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} />
          <TextField label="Ends (optional)" type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </div>
        <div className="evt-grid-2">
          <TextField label="Place" value={form.venue} maxLength={120} onChange={(e) => set({ venue: e.target.value })} placeholder="The shop" />
          <TextField label="Address" value={form.address} maxLength={200} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <TextField label="Online link (optional)" type="url" value={form.onlineUrl} onChange={(e) => set({ onlineUrl: e.target.value })}
          placeholder="https://" hint="Only people with a ticket get this link, in their ticket email." />

        <PhotoField photo={form.photo} onChange={(photo) => set({ photo })} />

        <fieldset className="evt-tickets">
          <legend>Tickets</legend>
          {form.tickets.map((t) => (
            <div key={t.id} className="evt-ticket">
              <TextField label="Ticket" value={t.name} maxLength={60} onChange={(e) => setTicket(t.id, { name: e.target.value })} placeholder="General" />
              <TextField label="Price" inputMode="decimal" value={t.price} onChange={(e) => setTicket(t.id, { price: e.target.value })} placeholder="Free" />
              <TextField label="Places" inputMode="numeric" value={t.places} onChange={(e) => setTicket(t.id, { places: e.target.value })}
                hint={sold[t.id] ? `${sold[t.id]} sold` : undefined} />
              <TextField label="Per order" inputMode="numeric" value={t.maxPerOrder} onChange={(e) => setTicket(t.id, { maxPerOrder: e.target.value })} />
              {form.tickets.length > 1 && !sold[t.id]
                ? <IconButton label={`Remove ${t.name || "this ticket"}`} tone="danger" onClick={() => set({ tickets: form.tickets.filter((x) => x.id !== t.id) })}><Trash2 size={16} aria-hidden /></IconButton>
                : <span className="evt-ticket-gap" aria-hidden="true" />}
            </div>
          ))}
          {form.tickets.length < MAX_TICKET_KINDS && (
            <GhostButton icon={<Plus size={16} aria-hidden />} onClick={() => set({ tickets: [...form.tickets, blankTicket()] })}>Add another ticket</GhostButton>
          )}
        </fieldset>

        <fieldset className="evt-tickets">
          <legend>Extras</legend>
          <p className="evt-extras-hint">Small things people can add when they get tickets, like a programme or a drink. They don't take a place.</p>
          {form.extras.map((x) => (
            <div key={x.id} className="evt-ticket evt-extra">
              <TextField label="Extra" value={x.name} maxLength={60} onChange={(e) => setExtra(x.id, { name: e.target.value })} placeholder="Programme" />
              <TextField label="Price" inputMode="decimal" value={x.price} onChange={(e) => setExtra(x.id, { price: e.target.value })} placeholder="5.00" />
              <TextField label="Per order" inputMode="numeric" value={x.maxPerOrder} onChange={(e) => setExtra(x.id, { maxPerOrder: e.target.value })} />
              <IconButton label={`Remove ${x.name || "this extra"}`} tone="danger" onClick={() => set({ extras: form.extras.filter((e) => e.id !== x.id) })}><Trash2 size={16} aria-hidden /></IconButton>
            </div>
          ))}
          {form.extras.length < MAX_EXTRAS && (
            <GhostButton icon={<Plus size={16} aria-hidden />} onClick={() => set({ extras: [...form.extras, blankExtra()] })}>{form.extras.length ? "Add another extra" : "Add an extra"}</GhostButton>
          )}
        </fieldset>

        <TextField label="Booking fee per paid ticket (optional)" inputMode="decimal" value={form.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="None"
          hint="Yours to keep, to help with card costs. Buyers see it before they pay. Free tickets never carry it." />

        <SelectField label="Where it stands" value={form.status} onChange={(e) => set({ status: e.target.value as EventStatus })}
          hint={STATUS_CHOICES.find((c) => c.id === form.status)?.hint}>
          {STATUS_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <Toggle label={form.extras.length ? "Add sales tax to ticket and extra prices" : "Add sales tax to ticket prices"} checked={form.chargeTax} onChange={(chargeTax) => set({ chargeTax })} />
        {problem && <p className="rp-error-text" role="alert">{problem}</p>}
      </div>
      {confirmNode}
    </Drawer>
  );
}

type DoorResult = { state: "in" | "already" | "refused"; name?: string; what?: string; say: string; code?: string };

function GuestList({ event, door, zone, currency, others, onClose }: { event: AdminEvent; door: boolean; zone: string; currency: string; others: AdminEvent[]; onClose: () => void }) {
  const [orders, setOrders] = useState<TicketOrder[] | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const [typed, setTyped] = useState("");
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<DoorResult | null>(null);
  const [refunding, setRefunding] = useState<TicketOrder | null>(null);
  const [calling, setCalling] = useState(false);
  const [moving, setMoving] = useState<TicketOrder | null>(null);
  const load = () => eventsAdmin<{ orders: TicketOrder[] }>("orders", { eventId: event.id })
    .then((answer) => { setOrders(answer.orders || []); setError(""); })
    .catch((err) => setError(problemOf(err, "The guest list didn't load.")));
  useEffect(() => { void load(); }, [event.id]);
  const when = whenParts(event.start, zone);
  const tickets = (orders || []).reduce((sum, o) => sum + o.tickets.length, 0);
  const arrived = arrivedCount(orders || []);
  const shown = findGuests(orders || [], find);
  const held = (orders || []).filter((o) => o.status === "paid").length;
  const canCheckIn = event.status !== "cancelled";
  const timeOf = (iso: string) => whenParts(iso, zone).time;

  const resend = async (order: TicketOrder) => {
    setSending(order.id);
    try { await eventsAdmin("resendTickets", { orderId: order.id }); toast.success(`Tickets sent again to ${order.email}.`); }
    catch (err) { toast.error(problemOf(err, "The email didn't go out. Try again.")); }
    finally { setSending(""); }
  };
  const download = () => saveFile(`guest-list-${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.csv`,
    `\uFEFF${guestCsv(orders || [])}`, "text/csv;charset=utf-8");

  // One ticket in (or back out) by its code. The server decides; the list here follows its answer.
  const checkIn = async (raw: string, value = true) => {
    const code = cleanTicketCode(raw);
    if (!code) { setResult({ state: "refused", say: "A ticket code is eight letters and numbers, like K7QM-2XPA." }); return; }
    setBusy(code);
    try {
      const answer = await eventsAdmin<DoorAnswer>("checkIn", { eventId: event.id, code, ...(value ? {} : { value: false }) });
      const t = answer.ticket;
      setOrders((list) => withTicketUsed(list || [], t.code, t.usedAt));
      setResult(!value ? null : {
        state: answer.already ? "already" : "in", name: t.name || "No name", code: t.code,
        what: `${t.kind} · ticket ${t.number} of ${t.of}`,
        say: answer.already ? `This ticket was already used${t.usedAt ? ` (${timeOf(t.usedAt)})` : ""}. Don't let it in twice.` : "Checked in. Welcome them in.",
      });
    } catch (err) {
      setResult({ state: "refused", say: problemOf(err, "That didn't work just now. Try again.") });
    } finally {
      setBusy("");
      setTyped("");
      if (value) window.setTimeout(() => document.querySelector<HTMLInputElement>(".evt-door-input")?.focus(), 0);
    }
  };

  return (
    <Drawer open onClose={onClose} title={door ? "At the door" : "Who's coming"} description={`${event.title} · ${when.weekday} ${when.day} ${when.month}, ${when.time}`} size="lg"
      footerStart={held > 0 ? <DestructiveButton onClick={() => setCalling(true)}>{event.status === "cancelled" ? "Refund everyone" : "Cancel event"}</DestructiveButton> : undefined}
      footer={<><GhostButton onClick={onClose}>Close</GhostButton>
        <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={download} disabled={!orders?.length}>Download guest list</SecondaryButton></>}>
      {error ? <ErrorState title="The guest list didn't load" description={error} onRetry={() => { void load(); }} />
        : !orders ? <LoadingState label="Reading the guest list…" />
        : orders.length === 0 ? <EmptyState inline title="No tickets sold yet" description="When someone buys a ticket, they show up here with a code for the door." />
        : (
          <>
            {canCheckIn && (
              <section className="evt-door" aria-label="Check tickets in">
                <div className="evt-door-count" role="status">
                  <strong>{arrived}</strong><span>of {tickets} arrived</span>
                  <div className="evt-bar" aria-hidden="true"><i style={{ width: `${tickets ? Math.round((arrived / tickets) * 100) : 0}%` }} /></div>
                </div>
                <form className="evt-door-form" onSubmit={(e) => { e.preventDefault(); void checkIn(typed); }}>
                  <TextField label="Ticket code" placeholder="K7QM-2XPA" autoFocus={door} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                    className="evt-door-input" value={typed} onChange={(e) => setTyped(e.target.value)} />
                  <div className="evt-door-actions">
                    <PrimaryButton type="submit" icon={<Check size={16} aria-hidden />} busy={!!busy && busy === cleanTicketCode(typed)} disabled={!!busy || !typed.trim()}>Check in</PrimaryButton>
                    <ScanBarcodeButton label="Scan a ticket" title="Scan a ticket" description="Hold the QR code on their phone inside the picture. It checks them in by itself."
                      qr={(raw) => cleanTicketCode(raw)} onCode={(code) => { void checkIn(code); }} />
                  </div>
                </form>
                {result && (
                  <div className="evt-arrival" data-state={result.state} role="status" aria-live="assertive">
                    {result.name && <p className="evt-arrival-name">{result.name}</p>}
                    {result.what && <p className="evt-arrival-what">{result.what}</p>}
                    <p className="evt-arrival-say">{result.say}</p>
                    {result.state === "in" && result.code && (
                      <div><GhostButton size="sm" disabled={!!busy} onClick={() => { void checkIn(result.code!, false); }}>Undo check-in</GhostButton></div>
                    )}
                  </div>
                )}
              </section>
            )}

            <div className="evt-guest-tools">
              <p className="evt-guest-count">{tickets} {tickets === 1 ? "ticket" : "tickets"} in {held} {held === 1 ? "order" : "orders"}</p>
              {orders.length > 4 && <TextField label="Find a guest" hideLabel type="search" placeholder="Find by name, email or code" value={find} onChange={(e) => setFind(e.target.value)} />}
            </div>
            {shown.length === 0 && <p className="evt-guest-none">Nobody on the list matches “{find.trim()}”.</p>}
            <ul className="evt-guests">
              {shown.map((order) => (
                <li key={order.id} className="evt-guest" data-refunded={order.status === "refunded" ? "true" : undefined}>
                  <div className="evt-guest-head">
                    <div>
                      <strong>{order.name || "No name"}</strong>
                      {order.test && <StatusBadge tone="warning">Test</StatusBadge>}
                      {order.status === "refunded" && <StatusBadge tone="neutral">{order.refundedMinor ? "Refunded" : "Cancelled"}</StatusBadge>}
                      <span className="evt-guest-mail">{order.email}</span>
                    </div>
                    <span className="evt-guest-paid">
                      {order.status === "refunded" && order.refundedMinor ? null
                        : order.chargedMinor ? moneyText(Math.max(0, order.chargedMinor - (order.refundedMinor || 0)), order.currency || currency) : "Free"}
                      {!!order.refundedMinor && <small>{moneyText(order.refundedMinor, order.currency || currency)} sent back</small>}
                      {!!order.feeMinor && order.status === "paid" && <small>Includes {moneyText(order.feeMinor, order.currency || currency)} booking fee</small>}
                      {!!order.discount?.amountMinor && <small>Code {order.discount.code}, {moneyText(order.discount.amountMinor, order.currency || currency)} off</small>}
                    </span>
                  </div>
                  {order.status === "refunded" && (
                    <p className="evt-guest-gone">{order.refundedTickets === 1 ? "Their ticket was" : `Their ${order.refundedTickets || ""} tickets were`.replace("  ", " ")} given back{order.refundedAt ? ` on ${whenParts(order.refundedAt, zone).day} ${whenParts(order.refundedAt, zone).month}` : ""}. The places are on sale again.</p>
                  )}
                  {order.status === "paid" && !!extrasText(order) && <p className="evt-guest-extras"><span>Extras</span> {extrasText(order)}</p>}
                  <ul className="evt-codes">
                    {order.tickets.map((t) => (
                      <li key={t.code} data-used={t.usedAt ? "true" : undefined}>
                        <span>{t.name}</span>
                        <code>{t.code}</code>
                        {t.usedAt
                          ? <span className="evt-code-state"><StatusBadge tone="success">Arrived {timeOf(t.usedAt)}</StatusBadge>
                            <GhostButton size="sm" disabled={!!busy} onClick={() => { void checkIn(t.code, false); }} aria-label={`Undo check-in for ticket ${t.code}`}>Undo</GhostButton></span>
                          : canCheckIn && <span className="evt-code-state"><SecondaryButton size="sm" busy={busy === t.code} disabled={!!busy} onClick={() => { void checkIn(t.code); }} aria-label={`Check in ticket ${t.code}, ${order.name || "no name"}`}>Check in</SecondaryButton></span>}
                      </li>
                    ))}
                  </ul>
                  {order.status === "paid" && (
                    <div className="evt-guest-actions">
                      <GhostButton icon={<Mail size={16} aria-hidden />} onClick={() => { void resend(order); }} busy={sending === order.id}>Send tickets again</GhostButton>
                      {others.length > 0 && <GhostButton icon={<ArrowRightLeft size={16} aria-hidden />} onClick={() => setMoving(order)} aria-label={`Move ${order.name || "this order"} to another event`}>Move</GhostButton>}
                      <GhostButton icon={<Undo2 size={16} aria-hidden />} onClick={() => setRefunding(order)}>Refund</GhostButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      {calling && orders && (
        <CancelEventDialog event={event} orders={orders.filter((o) => o.status === "paid")} currency={currency}
          onClose={(changed) => { setCalling(false); if (changed) { setResult(null); void load(); } }} />
      )}
      {refunding && (
        <RefundDialog order={refunding} currency={currency} onClose={() => setRefunding(null)}
          onDone={(next) => { setOrders((list) => withOrderChanged(list || [], next)); setRefunding(null); }} />
      )}
      {moving && (
        <MoveDialog order={moving} others={others} zone={zone} onClose={() => setMoving(null)}
          onDone={() => { setOrders((list) => (list || []).filter((o) => o.id !== moving.id)); setResult(null); setMoving(null); }} />
      )}
    </Drawer>
  );
}

// Calls the whole event off: the server refunds a few orders per call, so this asks again until none are left and
// shows how far it is. Safe to close and press again: orders already given back are skipped.
function CancelEventDialog({ event, orders, currency, onClose }: { event: AdminEvent; orders: TicketOrder[]; currency: string; onClose: (changed: boolean) => void }) {
  const [money, setMoney] = useState(true);
  const [state, setState] = useState<"ask" | "busy" | "done">("ask");
  const [done, setDone] = useState(0);
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const tickets = orders.reduce((sum, o) => sum + o.tickets.length, 0);
  const total = orders.reduce((sum, o) => sum + Math.max(0, o.chargedMinor - (o.refundedMinor || 0)), 0);
  const cash = (minor: number) => moneyText(minor, currency);
  const go = async () => {
    setState("busy");
    setError("");
    const skip: { id: string; name: string }[] = [];
    let count = 0; let amount = 0;
    try {
      for (let round = 0; round < 200; round += 1) {
        const answer = await eventsAdmin<CancelAnswer>("cancelEvent", { id: event.id, money, skip: skip.map((f) => f.id) });
        count += answer.done; amount += answer.amountMinor; skip.push(...answer.failed);
        setDone(count); setSent(amount); setFailed([...skip]);
        if (answer.left <= 0) break;
      }
      setState("done");
    } catch (err) {
      setError(problemOf(err, "That stopped part way. Press the button again to carry on; nobody is refunded twice."));
      setState(count ? "done" : "ask");
    }
  };
  const called = event.status === "cancelled";
  return (
    <Dialog open onClose={state === "busy" ? () => {} : () => onClose(state === "done" || done > 0)} title={called ? "Refund everyone" : "Cancel this event"} description={event.title}
      footer={state === "done"
        ? <PrimaryButton onClick={() => onClose(true)}>Done</PrimaryButton>
        : <><GhostButton onClick={() => onClose(done > 0)} disabled={state === "busy"}>Keep the event</GhostButton>
          <DestructiveButton onClick={() => { void go(); }} busy={state === "busy"}>{money && total > 0 ? `${called ? "Refund" : "Cancel and refund"} ${cash(total)}` : called ? "Cancel the tickets" : "Cancel the event"}</DestructiveButton></>}>
      <div className="evt-refund">
        {state === "done" ? (
          <>
            <p className="evt-refund-sum" role="status">
              <strong>{done}</strong> {done === 1 ? "order" : "orders"} given back{sent > 0 ? <>, {cash(sent)} on its way to their cards</> : ""}. Every guest has an email.
            </p>
            {failed.length > 0 && (
              <div className="evt-refund-error" role="alert">
                <p>{failed.length === 1 ? "One order" : `${failed.length} orders`} couldn't be refunded and still {failed.length === 1 ? "holds its" : "hold their"} tickets:</p>
                <ul>{failed.map((f) => <li key={f.id}>{f.name || "No name"}</li>)}</ul>
                <p>Open each one in the guest list and press Refund to try again.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="evt-refund-sum" role="status">
              {state === "busy"
                ? <><strong>{done}</strong> of {orders.length} {orders.length === 1 ? "order" : "orders"} given back…</>
                : <><strong>{tickets}</strong> {tickets === 1 ? "ticket" : "tickets"} in {orders.length} {orders.length === 1 ? "order" : "orders"} {tickets === 1 ? "is" : "are"} given back, and ticket sales stop.</>}
            </p>
            {total > 0 && <Toggle label="Send the money back" checked={money} onChange={setMoney} disabled={state === "busy"} />}
            <p className="evt-refund-note">
              {money && total > 0 ? `${cash(total)} goes back to the cards they paid with. ` : total > 0 ? "No money is sent. " : ""}
              Every guest gets an email saying the event is cancelled. This can't be undone.
            </p>
          </>
        )}
        {error && <p className="evt-refund-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

// Puts an order's tickets on another event: the same codes, no money either way. The owner picks the event and, where
// the ticket names differ, which ticket each one becomes. The server checks the places again before anything moves.
function MoveDialog({ order, others, zone, onClose, onDone }: { order: TicketOrder; others: AdminEvent[]; zone: string; onClose: () => void; onDone: () => void }) {
  // Starts on the first event with room for the whole order.
  const fits = (e: AdminEvent) => { const k = moveKinds(order.tickets, e.tickets); return order.tickets.every((t) => !k[t.ticketId] || order.tickets.filter((x) => k[x.ticketId] === k[t.ticketId]).length <= (e.left[k[t.ticketId]!] || 0)); };
  const [toId, setToId] = useState(() => (others.find(fits) || others[0])?.id || "");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = others.find((e) => e.id === toId);
  const olds = order.tickets.filter((t, i, all) => all.findIndex((x) => x.ticketId === t.ticketId) === i);
  const kinds = target ? moveKinds(order.tickets, target.tickets, picks) : {};
  const arriving: Record<string, number> = {};
  for (const t of order.tickets) { const k = kinds[t.ticketId]; if (k) arriving[k] = (arriving[k] || 0) + 1; }
  const short = target?.tickets.find((k) => (arriving[k.id] || 0) > Math.max(0, target.left[k.id] || 0));
  const unpicked = olds.some((t) => !kinds[t.ticketId]);
  const who = order.name || order.email;
  const count = order.tickets.length;
  const arrived = order.tickets.some((t) => t.usedAt);
  const dayOf = (e: AdminEvent) => { const w = whenParts(e.start, zone); return `${w.weekday} ${w.day} ${w.month}, ${w.time}`; };
  const go = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const answer = await eventsAdmin<MoveAnswer>("moveOrder", { orderId: order.id, toEventId: target.id, kinds });
      toast.success(answer.told ? `Moved to ${target.title}. ${who} has an email with the new date.` : `Moved to ${target.title}. The email didn't go out: send the tickets again from that event's guest list.`);
      onDone();
    } catch (err) {
      setError(problemOf(err, "The move didn't go through. Try again."));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Move to another event" description={`${who} · ${count} ${count === 1 ? "ticket" : "tickets"}`}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Leave them here</GhostButton>
        <PrimaryButton onClick={() => { void go(); }} busy={busy} disabled={!target || unpicked || !!short}>Move {count === 1 ? "ticket" : "tickets"}</PrimaryButton></>}>
      <div className="evt-refund">
        <SelectField label="Move to" value={toId} disabled={busy} onChange={(e) => { setToId(e.target.value); setPicks({}); setError(""); }}>
          {others.map((e) => <option key={e.id} value={e.id}>{e.title} · {dayOf(e)}{e.status === "draft" ? " (draft)" : ""}</option>)}
        </SelectField>
        {target && (target.tickets.length > 1 || unpicked) && olds.map((t) => (
          <SelectField key={t.ticketId} label={`“${t.name}” becomes`} value={kinds[t.ticketId] || ""} disabled={busy}
            onChange={(e) => { setPicks((p) => ({ ...p, [t.ticketId]: e.target.value })); setError(""); }}>
            {!kinds[t.ticketId] && <option value="">Choose a ticket</option>}
            {target.tickets.map((k) => { const left = Math.max(0, target.left[k.id] || 0); return <option key={k.id} value={k.id}>{k.name} · {left ? `${left} left` : "sold out"}</option>; })}
          </SelectField>
        ))}
        <p className="evt-refund-sum" role="status">
          {!target ? "Choose an event."
            : short ? <>{Math.max(0, target.left[short.id] || 0) ? `Only ${Math.max(0, target.left[short.id] || 0)} “${short.name}” ${Math.max(0, target.left[short.id] || 0) === 1 ? "place is" : "places are"} left there.` : `“${short.name}” is sold out there.`} Add places to that event first, or pick another.</>
            : unpicked ? "Choose which ticket they get at the new event."
            : <><strong>{count}</strong> {count === 1 ? "ticket moves" : "tickets move"} to {target.title} ({dayOf(target)})</>}
        </p>
        <p className="evt-refund-note">
          No money changes hands, and {count === 1 ? "the ticket code stays" : "the ticket codes stay"} the same. {who} gets an email with the new date, and {count === 1 ? "the place here goes" : "the places here go"} back on sale.
          {arrived ? " Check-ins on these tickets are cleared." : ""}
        </p>
        {error && <p className="evt-refund-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

// Gives an order's tickets back: all of them or the ones ticked. The amount shown comes from the same rule the server
// uses (shared/eventTickets.ts), and the server decides again before any money moves.
function RefundDialog({ order, currency, onClose, onDone }: { order: TicketOrder; currency: string; onClose: () => void; onDone: (next: TicketOrder) => void }) {
  const free = order.tickets.filter((t) => !t.usedAt);
  const [picked, setPicked] = useState<string[]>(() => free.map((t) => t.code));
  const [money, setMoney] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kept = Math.max(0, order.chargedMinor - (order.refundedMinor || 0));
  const amount = refundMinorFor(order, countsOfCodes(order, picked), order.tickets.length - picked.length);
  const sending = money && amount > 0;
  const cash = (minor: number) => moneyText(minor, order.currency || currency);
  const who = order.name || order.email;
  const many = picked.length !== 1;
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const answer = await eventsAdmin<RefundAnswer>("refund", { orderId: order.id, codes: picked, money });
      toast.success(answer.already ? "Those tickets were already given back."
        : answer.amountMinor ? `${cash(answer.amountMinor)} is on its way back to ${who}.` : `${many ? "Tickets" : "Ticket"} cancelled. ${who} has an email.`);
      onDone(answer.order);
    } catch (err) {
      setError(problemOf(err, "The refund didn't go through. Try again."));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Refund tickets" description={`${who} · ${order.tickets.length} ${order.tickets.length === 1 ? "ticket" : "tickets"}`}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Keep the tickets</GhostButton>
        <DestructiveButton onClick={() => { void go(); }} busy={busy} disabled={!picked.length}>
          {sending ? `Refund ${cash(amount)}` : `Cancel ${many ? "tickets" : "ticket"}`}
        </DestructiveButton></>}>
      <div className="evt-refund">
        <div className="evt-refund-list" role="group" aria-labelledby="evt-refund-which">
          <p id="evt-refund-which">Which tickets?</p>
          {order.tickets.map((t) => (
            <div key={t.code} className="evt-refund-row" data-used={t.usedAt ? "true" : undefined}>
              <Checkbox label={`${t.name} · ${t.code}`} checked={picked.includes(t.code)} disabled={!!t.usedAt || busy}
                onChange={(e) => setPicked((list) => (e.target.checked ? [...list, t.code] : list.filter((c) => c !== t.code)))} />
              {t.usedAt && <span>Checked in. Undo that first.</span>}
            </div>
          ))}
        </div>
        {kept > 0 && <Toggle label="Send the money back" checked={money} onChange={setMoney} disabled={busy} />}
        <p className="evt-refund-sum" role="status">
          {!picked.length ? "Pick at least one ticket."
            : sending ? <><strong>{cash(amount)}</strong> goes back to the card they paid with. It can take a few days to show.</>
            : kept > 0 ? "No money is sent. The tickets stop working."
            : "These tickets were free, so no money moves. The tickets stop working."}
        </p>
        {!!extrasText(order) && picked.length > 0 && (
          <p className="evt-refund-note">{picked.length < order.tickets.length ? `Their extras (${extrasText(order)}) aren't refunded while they keep a ticket.` : `Their extras (${extrasText(order)}) are refunded too.`}</p>
        )}
        <p className="evt-refund-note">{who} gets an email, and the {many ? "places go" : "place goes"} back on sale. This can't be undone.</p>
        {error && <p className="evt-refund-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

/** The event's picture for its page on the website: one photo, made smaller in the browser, kept with the shop's other pictures. */
function PhotoField({ photo, onChange }: { photo: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose a picture (JPG, PNG or WebP)."); return; }
    setBusy(true);
    try {
      const [{ prepareProductImage }, { adminApi }] = await Promise.all([import("./prepareImage"), import("./api")]);
      const ready = await prepareProductImage(file, 1600);
      const ext = (ready.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      onChange(await adminApi.uploadFile(ready, `assets/events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`));
    } catch {
      toast.error("The picture couldn't be added. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="evt-photo">
      <span className="evt-photo-label">Picture (optional)</span>
      <div className="evt-photo-row">
        {photo ? <img src={photo} alt="" className="evt-photo-thumb" /> : <span className="evt-photo-thumb" data-empty aria-hidden><ImagePlus size={20} /></span>}
        <div className="evt-photo-actions">
          <SecondaryButton onClick={() => input.current?.click()} busy={busy}>{photo ? "Change picture" : "Add a picture"}</SecondaryButton>
          {photo && <GhostButton onClick={() => onChange("")} disabled={busy}>Remove</GhostButton>}
        </div>
      </div>
      <p className="evt-photo-hint">Shown on the event's page on your website. A wide picture works best.</p>
      <input ref={input} type="file" accept="image/*" hidden aria-label="Event picture" onChange={(e) => { void choose(e.target.files?.[0]); }} />
    </div>
  );
}
