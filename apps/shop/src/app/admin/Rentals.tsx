// Admin › Rentals (beta, R1; LMB-PLATFORM plan "Four more ways to sell"). Things the shop rents out by the hour or the
// day, a week's timeline per unit, and the rentals coming up with their steps (picked up, returned, cancel with refund),
// in the Colophon bento look (bookings.css tiles + rentals.css, tokens only). Shown only when Rentals is on for the
// shop (both switches, Dashboard.tsx). Every read and change goes through the server (rentalsApi.ts).
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Pencil, Plus, Trash2, Undo2, Check, PackageOpen, CreditCard, Link2, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import {
  Drawer, EmptyState, ErrorState, GhostButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { rentalsAdmin, type AdminRental, type RentalsList } from "./rentalsApi";
import { blankItem, FEE_REASONS, formFromItem, isLate, itemToSave, lengthWords, moneyLines, priceLine, recentlyBack, rentalTotals, statusOf, timelineRows, UNIT_STATES, unitStateOf, unitsLine, whenText, type ItemForm, type UnitState } from "./rentalsView";
import { moneyText, priceMinorOf } from "./eventsView";
import { MAX_ITEMS, type RentalItem } from "../../shared/rentalRules";
import { MONEY_SIGN, SHOP_CURRENCY } from "./moneySign";
import "./bookings.css";
import "./rentals.css";

const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;

export function Rentals() {
  const [data, setData] = useState<RentalsList | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<RentalItem | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const [confirm, confirmNode] = useConfirm();
  const [asking, setAsking] = useState<{ rental: AdminRental; kind: "fee" | "link" } | null>(null);
  const [unitsOf, setUnitsOf] = useState<RentalItem | null>(null);

  const reload = () => rentalsAdmin<RentalsList>("list")
    .then((answer) => { setData(answer); setError(""); })
    .catch((err) => setError(problemOf(err, "Your rentals didn't load.")));
  useEffect(() => { void reload(); }, []);
  const nowMs = useMemo(() => Date.now(), [data]);

  if (error && !data) return <ErrorState title="Your rentals didn't load" description={error} onRetry={() => { void reload(); }} />;
  if (!data) return <LoadingState label="Opening your rentals…" />;

  const currency = data.currency || SHOP_CURRENCY;
  const money = (minor: number) => moneyText(minor, currency);
  const totals = rentalTotals(data.rentals, nowMs);
  const fromMs = new Date(new Date(nowMs).toDateString()).getTime();
  const toMs = fromMs + WINDOW_DAYS * DAY_MS;
  const coming = data.rentals.filter((r) => r.status !== "cancelled" && r.status !== "returned");
  const back = recentlyBack(data.rentals, nowMs);
  const row = (r: AdminRental) => <RentalRow key={r.id} r={r} zone={data.zone} money={money} nowMs={nowMs} busy={busy} onStep={(op) => { void step(r, op); }} onAsk={(kind) => setAsking({ rental: r, kind })} />;

  const step = async (r: AdminRental, op: "pickedUp" | "returned" | "cancel") => {
    if (op === "cancel") {
      const ok = await confirm({
        title: `Cancel ${r.name}'s rental?`,
        message: `${money(r.chargedMinor)} goes back to their card and they get an email. This can't be undone.`,
        confirmLabel: "Cancel and refund",
      });
      if (!ok) return;
    }
    setBusy(`${op}:${r.id}`);
    try {
      await rentalsAdmin(op, { id: r.id });
      toast.success(op === "pickedUp" ? "Marked as picked up." : op === "returned" ? "Marked as returned." : "Cancelled and refunded.");
      await reload();
    } catch (err) {
      toast.error(problemOf(err, "That didn't save just now. Please try again."));
    } finally {
      setBusy("");
    }
  };
  const remove = async (item: RentalItem) => {
    if (!(await confirm({ title: `Delete ${item.name}?`, message: "It comes off your Rentals page. Past rentals stay in your records.", confirmLabel: "Delete" }))) return;
    try { await rentalsAdmin("deleteItem", { id: item.id }); toast.success("Deleted."); await reload(); } catch (err) { toast.error(problemOf(err, "That didn't delete just now.")); }
  };

  return (
    <div className="bkg-page rnt-page">
      <PageActions>
        <SecondaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open("/rentals", "_blank", "noopener")}>View Rentals page</SecondaryButton>
        <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setEditing("new")} disabled={data.items.length >= MAX_ITEMS}>New item</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Rentals is new. Tell us what would make it better from Help.</span>
      </div>

      <section className="bkg-bento rnt-bento" aria-label="At a glance">
        <div className="bkg-tile bkg-tile-mint">
          <p className="bkg-kicker">Out now</p>
          <p className="bkg-big">{totals.out}</p>
          <p className="bkg-sub rnt-soft">{totals.out === 1 ? "rental picked up" : "rentals picked up"}</p>
        </div>
        <div className={totals.late ? "bkg-tile bkg-tile-ink" : "bkg-tile"}>
          <p className="bkg-kicker">Late back</p>
          <p className="bkg-big">{totals.late}</p>
          <p className={totals.late ? "bkg-sub rnt-soft" : "bkg-sub"}>{totals.late ? "past their return time" : "everything is back on time"}</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">Next 7 days</p>
          <p className="bkg-big">{totals.coming}</p>
          <p className="bkg-sub">{totals.coming === 1 ? "rental to hand out" : "rentals to hand out"}</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">This month</p>
          <p className="bkg-big bkg-big-money">{money(totals.monthMinor)}</p>
          <p className="bkg-sub">taken for rentals</p>
        </div>
      </section>

      <div className="rnt-head">
        <h2 className="rnt-title">Items</h2>
        <p className="rnt-meta">{data.items.length} of {MAX_ITEMS} · the next {WINDOW_DAYS} days</p>
      </div>
      {data.items.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState sketch="cards" icon={<PackageOpen size={24} aria-hidden />} title="Nothing to rent yet"
            description="Add something people can rent: a camera, a bike, a room. Set its price by the hour or the day, how many you have, and the time you need to clean it between rentals."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setEditing("new")}>New item</PrimaryButton>} />
        </div>
      ) : (
        <ul className="rnt-items" aria-label="Items">
          {data.items.map((item) => (
            <li key={item.id} className="bkg-tile rnt-item" data-hidden={item.status === "draft" || undefined}>
              <div className="rnt-item-top">
                <div className="rnt-item-name">
                  <h3>{item.name}</h3>
                  {item.status === "draft" && <StatusBadge tone="neutral" glyph={false}>Hidden</StatusBadge>}
                </div>
                <div className="rnt-actions">
                  <GhostButton icon={<Pencil size={16} aria-hidden />} onClick={() => setEditing(item)}>Edit</GhostButton>
                  <GhostButton icon={<Wrench size={16} aria-hidden />} onClick={() => setUnitsOf(item)}>Units</GhostButton>
                  <GhostButton icon={<Trash2 size={16} aria-hidden />} onClick={() => { void remove(item); }}>Delete</GhostButton>
                </div>
              </div>
              <p className="rnt-meta">
                {priceLine(item, money)} · {unitsLine(item)}
                {item.cleanMinutes > 0 ? ` · ${item.cleanMinutes} min to clean` : ""} · open {item.opens} to {item.closes}
              </p>
              <Timeline item={item} rentals={data.rentals} fromMs={fromMs} toMs={toMs} nowMs={nowMs} zone={data.zone} />
            </li>
          ))}
        </ul>
      )}

      <div className="rnt-head">
        <h2 className="rnt-title">Coming up and out now</h2>
        <p className="rnt-meta">{coming.length === 1 ? "1 rental" : `${coming.length} rentals`}</p>
      </div>
      {coming.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState inline icon={<CalendarClock size={24} aria-hidden />} title="No rentals coming up" description="When someone pays for a rental, it shows here with the unit to hand them." />
        </div>
      ) : (
        <ul className="rnt-list" aria-label="Rentals">{coming.map(row)}</ul>
      )}

      {back.length > 0 && (<>
        <div className="rnt-head">
          <h2 className="rnt-title">Back in the last two weeks</h2>
          <p className="rnt-meta">Charge a late or damage fee here, or ask for a payment</p>
        </div>
        <ul className="rnt-list" aria-label="Rentals brought back">{back.map(row)}</ul>
      </>)}

      {confirmNode}
      {asking && <MoneyDrawer rental={asking.rental} kind={asking.kind} money={money} onClose={() => setAsking(null)} onDone={() => { setAsking(null); void reload(); }} />}
      {unitsOf && <UnitsDrawer item={data.items.find((i) => i.id === unitsOf.id) || unitsOf} zone={data.zone} money={money} onClose={() => setUnitsOf(null)} onChanged={() => { void reload(); }} />}
      {editing && <ItemDrawer start={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
  );
}

function RentalRow({ r, zone, money, nowMs, busy, onStep, onAsk }: {
  r: AdminRental; zone: string; money: (m: number) => string; nowMs: number; busy: string;
  onStep: (op: "pickedUp" | "returned" | "cancel") => void; onAsk: (kind: "fee" | "link") => void;
}) {
  const status = statusOf(r);
  const late = isLate(r, nowMs);
  const lines = moneyLines(r, money);
  const afterPay = r.status === "paid" || r.status === "out" || r.status === "returned";
  return (
    <li className="bkg-tile rnt-row">
      <div className="rnt-main">
        <div className="rnt-who">
          <strong>{r.name}</strong>
          <StatusBadge tone={late ? "danger" : status.tone} glyph={false}>{late ? "Late back" : status.label}</StatusBadge>
          {r.test && <StatusBadge tone="neutral" glyph={false}>Test</StatusBadge>}
        </div>
        <p className="rnt-when">{r.itemName}, unit {r.unit} · {whenText(r, zone)}</p>
        <p className="rnt-meta">{lengthWords(r)} · {r.email}</p>
        {lines.length > 0 && <ul className="rnt-money">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        {(r.lateBy || 0) > 0 && (r.suggestedLateMinor || 0) > 0 && (
          <p className="rnt-late">{r.status === "returned" ? "Came back" : "Running"} {r.lateBy} {r.basis === "hour" ? (r.lateBy === 1 ? "hour" : "hours") : (r.lateBy === 1 ? "day" : "days")} late: the late fee would be {money(r.suggestedLateMinor || 0)}. Nothing is charged until you do it.</p>
        )}
      </div>
      <div className="rnt-side">
        <p className="rnt-amount">{money(r.chargedMinor)}{r.taxMinor > 0 && <small>includes {money(r.taxMinor)} tax</small>}</p>
        <div className="rnt-actions">
          {r.status === "paid" && <SecondaryButton icon={<Check size={16} aria-hidden />} busy={busy === `pickedUp:${r.id}`} onClick={() => onStep("pickedUp")}>Picked up</SecondaryButton>}
          {(r.status === "paid" || r.status === "out") && <SecondaryButton icon={<Undo2 size={16} aria-hidden />} busy={busy === `returned:${r.id}`} onClick={() => onStep("returned")}>Returned</SecondaryButton>}
          {afterPay && r.card && (r.feeRoomMinor || 0) >= 50 && <GhostButton icon={<CreditCard size={16} aria-hidden />} onClick={() => onAsk("fee")}>Charge a fee</GhostButton>}
          {afterPay && <GhostButton icon={<Link2 size={16} aria-hidden />} onClick={() => onAsk("link")}>Ask for a payment</GhostButton>}
          {r.status === "paid" && <GhostButton busy={busy === `cancel:${r.id}`} onClick={() => onStep("cancel")}>Cancel</GhostButton>}
        </div>
      </div>
    </li>
  );
}

/** Charge the kept card (never past the deposit) or send a pay link: always the owner's own tap. */
function MoneyDrawer({ rental, kind, money, onClose, onDone }: { rental: AdminRental; kind: "fee" | "link"; money: (m: number) => string; onClose: () => void; onDone: () => void }) {
  const room = rental.feeRoomMinor || 0;
  const suggested = kind === "fee" ? rental.suggestedLateMinor || 0 : 0;
  const [amount, setAmount] = useState(suggested ? (suggested / 100).toFixed(2) : "");
  const [reason, setReason] = useState<keyof typeof FEE_REASONS>(suggested ? "late" : "damage");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const minor = priceMinorOf(amount);
  const go = async () => {
    if (!Number.isInteger(minor) || minor < 50) { setProblem("Type an amount of at least 0.50, like 25 or 12.50."); return; }
    if (kind === "fee" && minor > room) { setProblem(`The deposit leaves ${money(room)} to charge. Ask for a payment for more.`); return; }
    setBusy(true);
    setProblem("");
    try {
      if (kind === "fee") await rentalsAdmin("chargeFee", { id: rental.id, amountMinor: minor, reason, note });
      else await rentalsAdmin("payLink", { id: rental.id, amountMinor: minor, note });
      toast.success(kind === "fee" ? `${money(minor)} charged. ${rental.name} gets an email saying why.` : `Pay link sent to ${rental.email}.`);
      onDone();
    } catch (err) {
      setProblem(problemOf(err, "That didn't go through just now. Nothing was charged."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={kind === "fee" ? `Charge ${rental.name}'s card` : `Ask ${rental.name} for a payment`}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void go(); }} busy={busy}>{kind === "fee" ? `Charge ${Number.isInteger(minor) && minor > 0 ? money(minor) : "the fee"}` : "Send the pay link"}</PrimaryButton></>}>
      <div className="rnt-form">
        <p className="rnt-meta">{rental.itemName}, unit {rental.unit}. {kind === "fee"
          ? `${rental.card} is kept for up to ${money(room)} more. The charge goes through now and they get an email with the reason.`
          : "They get an email with a link to pay by card. It stays open for a day, and the payment shows here once it's made."}</p>
        {kind === "fee" && (
          <SelectField label="What it's for" value={reason} onChange={(e) => setReason(e.target.value as keyof typeof FEE_REASONS)}>
            {Object.entries(FEE_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </SelectField>
        )}
        <TextField label={`Amount (${MONEY_SIGN})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={kind === "fee" && suggested ? `The late fee for ${rental.lateBy} ${rental.basis === "hour" ? "hours" : "days"} is ${money(suggested)}.` : undefined} />
        <TextField label="Note for them" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={kind === "fee" ? "Cracked lens hood" : "Repair to the back wheel"} hint="Shown in their email. Optional." />
        {problem && <p className="rnt-problem" role="alert">{problem}</p>}
      </div>
    </Drawer>
  );
}

/** One row per unit across the window, each rental a bar; a unit out for repair is marked. */
function Timeline({ item, rentals, fromMs, toMs, nowMs, zone }: { item: RentalItem; rentals: AdminRental[]; fromMs: number; toMs: number; nowMs: number; zone: string }) {
  const rows = timelineRows(item, rentals, fromMs, toMs, nowMs);
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, weekday: "short", day: "numeric" }).format(new Date(fromMs + i * DAY_MS + DAY_MS / 2)));
  return (
    <div className="rnt-timeline" role="table" aria-label={`${item.name}: rentals in the next ${WINDOW_DAYS} days`}>
      <div className="rnt-tl-row rnt-tl-days" role="row">
        <span className="rnt-tl-unit" role="columnheader">Unit</span>
        <div className="rnt-tl-track rnt-tl-scale" role="columnheader">{days.map((d) => <span key={d}>{d}</span>)}</div>
      </div>
      {rows.map((row) => (
        <div key={row.unit} className="rnt-tl-row" role="row" data-repair={row.repair || row.gone || undefined}>
          <span className="rnt-tl-unit" role="rowheader">{row.unit}{row.gone ? " · gone" : row.repair ? " · repair" : ""}</span>
          <div className="rnt-tl-track" role="cell">
            {row.bars.map((b) => (
              <span key={b.rental.id} className="rnt-tl-bar" data-status={b.rental.status} data-late={b.late || undefined} style={{ left: `${b.left}%`, width: `${b.width}%` }}
                title={`${b.rental.name}, ${whenText(b.rental, zone)}`}>
                <span className="rnt-tl-label">{b.rental.name}</span>
              </span>
            ))}
            {row.bars.length === 0 && <span className="rnt-tl-free">{row.gone ? "Written off or sold" : row.repair ? "Out for repair" : "Free all week"}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Each unit's state: rentable, out for repair, written off or sold. The server moves rentals still to come to another free
 * unit; any it can't are shown here first, and cancelled with a refund only when the owner says so.
 */
function UnitsDrawer({ item, zone, money, onClose, onChanged }: { item: RentalItem; zone: string; money: (m: number) => string; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(0);
  const [stuck, setStuck] = useState<{ unit: number; state: UnitState; rentals: AdminRental[] } | null>(null);
  const units = Array.from({ length: item.units }, (_, i) => i + 1);
  const change = async (unit: number, state: UnitState, cancelStuck = false) => {
    setBusy(unit);
    try {
      const answer = await rentalsAdmin<{ moved: number; cancelled: number; failed: string[] }>("unitState", {
        itemId: item.id, unit, state: state === "writtenOff" || state === "sold" ? "gone" : state, why: state === "sold" ? "sold" : "writtenOff", cancelStuck,
      });
      setStuck(null);
      const bits = [`Unit ${unit}: ${UNIT_STATES[state].toLowerCase()}.`];
      if (answer.moved) bits.push(`${answer.moved === 1 ? "1 rental moved" : `${answer.moved} rentals moved`} to another unit.`);
      if (answer.cancelled) bits.push(`${answer.cancelled === 1 ? "1 rental" : `${answer.cancelled} rentals`} cancelled and refunded.`);
      if (answer.failed?.length) toast.error(`These couldn't be refunded, so they stay booked: ${answer.failed.join(", ")}.`);
      toast.success(bits.join(" "));
      onChanged();
    } catch (err) {
      const e = err as Error & { code?: string; stuck?: AdminRental[] };
      if (e.code === "stuck" && e.stuck) setStuck({ unit, state, rentals: e.stuck });
      else toast.error(problemOf(err, "That didn't save just now. Please try again."));
    } finally {
      setBusy(0);
    }
  };
  return (
    <Drawer open onClose={onClose} title={`${item.name}: units`} footer={<GhostButton onClick={onClose}>Done</GhostButton>}>
      <div className="rnt-form">
        <p className="rnt-meta">Take a unit out for repair, or mark it written off or sold. Its rentals still to come move to another free unit. Nothing is cancelled unless you say so.</p>
        <ul className="rnt-units" aria-label="Units">
          {units.map((unit) => {
            const state = unitStateOf(item, unit);
            const gone = state === "writtenOff" || state === "sold";
            return (
              <li key={unit} className="rnt-unit" data-state={state}>
                <strong>Unit {unit}</strong>
                {gone
                  ? <StatusBadge tone="neutral" glyph={false}>{UNIT_STATES[state]}</StatusBadge>
                  : (
                    <SelectField label={`Unit ${unit}`} hideLabel value={state} disabled={busy > 0} onChange={(e) => {
                      const next = e.target.value as UnitState;
                      if (next !== state) void change(unit, next);
                    }}>
                      {(Object.keys(UNIT_STATES) as UnitState[]).map((k) => <option key={k} value={k}>{UNIT_STATES[k]}</option>)}
                    </SelectField>
                  )}
              </li>
            );
          })}
        </ul>
        {stuck && (
          <div className="rnt-stuck" role="alert">
            <p><strong>To mark unit {stuck.unit} {UNIT_STATES[stuck.state].toLowerCase()}: {stuck.rentals.length === 1 ? "this rental has" : "these rentals have"} no other unit free at {stuck.rentals.length === 1 ? "its" : "their"} time:</strong></p>
            <ul>{stuck.rentals.map((r) => <li key={r.id}>{r.name}, {whenText(r, zone)} · {money(r.chargedMinor)}</li>)}</ul>
            <p className="rnt-meta">You can leave unit {stuck.unit} as it is, or cancel {stuck.rentals.length === 1 ? "it" : "them"}: the money goes back to the card and they get an email.</p>
            <div className="rnt-actions">
              <GhostButton onClick={() => setStuck(null)}>Leave it as it is</GhostButton>
              <PrimaryButton busy={busy === stuck.unit} onClick={() => { void change(stuck.unit, stuck.state, true); }}>Cancel and refund</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ItemDrawer({ start, onClose, onSaved }: { start: RentalItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ItemForm>(() => (start ? formFromItem(start) : blankItem()));
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hourly = form.basis === "hour";
  const unitWord = hourly ? "hours" : "days";

  const save = async () => {
    const body = itemToSave(form);
    if ("problem" in body) { setProblem(String(body.problem)); return; }
    setBusy(true);
    setProblem("");
    try {
      await rentalsAdmin("saveItem", { item: body });
      toast.success(start ? "Saved." : "Added. It's on your Rentals page now.");
      onSaved();
    } catch (err) {
      setProblem(problemOf(err, "That didn't save just now. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={start ? `Edit ${start.name}` : "New rental item"}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>Save</PrimaryButton></>}>
      <div className="rnt-form">
        <TextField label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} placeholder="Camera kit" />
        <TextArea label="Description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={4000} hint="What's included, and anything people should know before they pick it up." />
        <div className="rnt-two">
          <SelectField label="Rented by the" value={form.basis} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value as "hour" | "day", minLength: "1", maxLength: e.target.value === "hour" ? "8" : "14" }))}>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
          </SelectField>
          <TextField label="How many you have" inputMode="numeric" value={form.units} onChange={(e) => set("units", e.target.value)} hint="Each one can be rented at the same time." />
        </div>
        <div className="rnt-two">
          {hourly
            ? <TextField label={`Price an hour (${MONEY_SIGN})`} inputMode="decimal" value={form.hour} onChange={(e) => set("hour", e.target.value)} />
            : <TextField label={`Price a day (${MONEY_SIGN})`} inputMode="decimal" value={form.day} onChange={(e) => set("day", e.target.value)} />}
          {hourly
            ? <TextField label={`Most for one day (${MONEY_SIGN})`} inputMode="decimal" value={form.day} onChange={(e) => set("day", e.target.value)} hint="Optional. A long rental never costs more than this." />
            : <TextField label={`Price a week (${MONEY_SIGN})`} inputMode="decimal" value={form.week} onChange={(e) => set("week", e.target.value)} hint="Optional. Used when it's cheaper than daily." />}
        </div>
        <div className="rnt-two">
          <TextField label={`Shortest, in ${unitWord}`} inputMode="numeric" value={form.minLength} onChange={(e) => set("minLength", e.target.value)} />
          <TextField label={`Longest, in ${unitWord}`} inputMode="numeric" value={form.maxLength} onChange={(e) => set("maxLength", e.target.value)} />
        </div>
        <div className="rnt-two">
          <TextField label="Pickup from" type="time" step={1800} value={form.opens} onChange={(e) => set("opens", e.target.value)} />
          <TextField label="Return by" type="time" step={1800} value={form.closes} onChange={(e) => set("closes", e.target.value)} />
        </div>
        <div className="rnt-two">
          <TextField label="Cleaning time, in minutes" inputMode="numeric" value={form.cleanMinutes} onChange={(e) => set("cleanMinutes", e.target.value)} hint="Kept free after each rental to check it over." />
          <TextField label="How far ahead people can rent it, in days" inputMode="numeric" value={form.daysAhead} onChange={(e) => set("daysAhead", e.target.value)} />
        </div>
        <div className="rnt-two">
          <TextField label={`Deposit (${MONEY_SIGN})`} inputMode="decimal" value={form.deposit} onChange={(e) => set("deposit", e.target.value)} hint="Optional. The card they pay with is kept for up to this much, for lateness or damage. Nothing is charged unless you do it." />
          <TextField label={`Late fee per ${hourly ? "hour" : "day"} (${MONEY_SIGN})`} inputMode="decimal" value={form.lateFee} onChange={(e) => set("lateFee", e.target.value)} hint="Optional. Suggested when it comes back late; needs a deposit." />
        </div>
        <Toggle label="Add sales tax" checked={form.chargeTax} onChange={(v) => set("chargeTax", v)} />
        <Toggle label="Show on your Rentals page" checked={form.status === "live"} onChange={(v) => set("status", v ? "live" : "draft")} />
        {problem && <p className="rnt-problem" role="alert">{problem}</p>}
      </div>
    </Drawer>
  );
}
