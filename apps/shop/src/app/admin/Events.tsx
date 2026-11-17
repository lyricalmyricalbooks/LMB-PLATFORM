// Admin › Events (beta, 17 November 2026; tasks/todo/2026-11-17-events-tickets-e1.md). The shop's events, their
// tickets and who is coming, in the Colophon bento look (bookings.css tiles + events.css, tokens only). Shown only when
// Events is on for the shop (the platform's switch and the owner's, Dashboard.tsx). Events, places and ticket orders
// are server-only records, so every read and change goes through the server (eventsApi.ts): it never sells one place twice.
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Download, Mail, Pencil, Plus, Ticket, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import {
  DestructiveButton, Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SelectField,
  StatusBadge, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { eventsAdmin, type AdminEvent, type TicketOrder } from "./eventsApi";
import {
  blankForm, blankTicket, eventFigures, eventFromForm, eventState, formFromEvent, guestCsv, moneyText, soldLine, splitEvents, STATE_WORDS, whenParts,
  type EventForm, type TicketForm,
} from "./eventsView";
import { MAX_TICKET_KINDS, type EventStatus } from "../../shared/eventTickets";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { saveFile } from "./xlsxWriter";
import "./bookings.css";
import "./events.css";

type ListAnswer = { zone: string; currency: string; events: AdminEvent[] };
const STATUS_CHOICES: { id: EventStatus; label: string; hint: string }[] = [
  { id: "draft", label: "Draft", hint: "Only you can see it." },
  { id: "live", label: "On sale", hint: "People can buy tickets until it starts." },
  { id: "cancelled", label: "Cancelled", hint: "No more tickets are sold. Tickets already bought are kept on record." },
];
const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Events() {
  const [data, setData] = useState<ListAnswer | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"coming" | "past">("coming");
  const [form, setForm] = useState<EventForm | null>(null);
  const [guestsOf, setGuestsOf] = useState<AdminEvent | null>(null);
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
            <button type="button" className="bkg-next-body" onClick={() => setGuestsOf(next)}>
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
            onEdit={() => setForm(formFromEvent(event, zone))} onGuests={() => setGuestsOf(event)} />)}
        </ul>
      )}

      {form && <EventEditor key={form.id || "new"} start={form} zone={zone} sold={data.events.find((e) => e.id === form.id)?.sold || {}}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload(); }} />}
      {guestsOf && <GuestList event={guestsOf} zone={zone} currency={currency} onClose={() => setGuestsOf(null)} />}
    </div>
  );
}

function EventRow({ event, zone, currency, nowMs, onEdit, onGuests }: { event: AdminEvent; zone: string; currency: string; nowMs: number; onEdit: () => void; onGuests: () => void }) {
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
          <span>{sold.text}{event.paidMinor ? ` · ${moneyText(event.paidMinor, currency)}` : ""}</span>
        </div>
      </div>
      <div className="evt-actions">
        <SecondaryButton icon={<Users size={16} aria-hidden />} onClick={onGuests}>Who's coming</SecondaryButton>
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

        <SelectField label="Where it stands" value={form.status} onChange={(e) => set({ status: e.target.value as EventStatus })}
          hint={STATUS_CHOICES.find((c) => c.id === form.status)?.hint}>
          {STATUS_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <Toggle label="Add sales tax to ticket prices" checked={form.chargeTax} onChange={(chargeTax) => set({ chargeTax })} />
        {problem && <p className="rp-error-text" role="alert">{problem}</p>}
      </div>
      {confirmNode}
    </Drawer>
  );
}

function GuestList({ event, zone, currency, onClose }: { event: AdminEvent; zone: string; currency: string; onClose: () => void }) {
  const [orders, setOrders] = useState<TicketOrder[] | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const load = () => eventsAdmin<{ orders: TicketOrder[] }>("orders", { eventId: event.id })
    .then((answer) => { setOrders(answer.orders || []); setError(""); })
    .catch((err) => setError(problemOf(err, "The guest list didn't load.")));
  useEffect(() => { void load(); }, [event.id]);
  const when = whenParts(event.start, zone);
  const tickets = (orders || []).reduce((sum, o) => sum + o.tickets.length, 0);

  const resend = async (order: TicketOrder) => {
    setSending(order.id);
    try { await eventsAdmin("resendTickets", { orderId: order.id }); toast.success(`Tickets sent again to ${order.email}.`); }
    catch (err) { toast.error(problemOf(err, "The email didn't go out. Try again.")); }
    finally { setSending(""); }
  };
  const download = () => saveFile(`guest-list-${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.csv`,
    `﻿${guestCsv(orders || [])}`, "text/csv;charset=utf-8");

  return (
    <Drawer open onClose={onClose} title="Who's coming" description={`${event.title} · ${when.weekday} ${when.day} ${when.month}, ${when.time}`} size="lg"
      footer={<><GhostButton onClick={onClose}>Close</GhostButton>
        <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={download} disabled={!orders?.length}>Download guest list</SecondaryButton></>}>
      {error ? <ErrorState title="The guest list didn't load" description={error} onRetry={() => { void load(); }} />
        : !orders ? <LoadingState label="Reading the guest list…" />
        : orders.length === 0 ? <EmptyState inline title="No tickets sold yet" description="When someone buys a ticket, they show up here with a code for the door." />
        : (
          <>
            <p className="evt-guest-count">{tickets} {tickets === 1 ? "ticket" : "tickets"} in {orders.length} {orders.length === 1 ? "order" : "orders"}</p>
            <ul className="evt-guests">
              {orders.map((order) => (
                <li key={order.id} className="evt-guest">
                  <div className="evt-guest-head">
                    <div>
                      <strong>{order.name || "No name"}</strong>
                      {order.test && <StatusBadge tone="warning">Test</StatusBadge>}
                      <span className="evt-guest-mail">{order.email}</span>
                    </div>
                    <span className="evt-guest-paid">{order.chargedMinor ? moneyText(order.chargedMinor, order.currency || currency) : "Free"}</span>
                  </div>
                  <ul className="evt-codes">
                    {order.tickets.map((t) => <li key={t.code}><span>{t.name}</span><code>{t.code}</code></li>)}
                  </ul>
                  <GhostButton icon={<Mail size={16} aria-hidden />} onClick={() => { void resend(order); }} busy={sending === order.id}>Send tickets again</GhostButton>
                </li>
              ))}
            </ul>
          </>
        )}
    </Drawer>
  );
}
