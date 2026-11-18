// Admin › Rentals (beta, R1; LMB-PLATFORM plan "Four more ways to sell"). Things the shop rents out by the hour or the
// day, a week's timeline per unit, and the rentals coming up with their steps (picked up, returned, cancel with refund),
// in the Colophon bento look (bookings.css tiles + rentals.css, tokens only). Shown only when Rentals is on for the
// shop (both switches, Dashboard.tsx). Every read and change goes through the server (rentalsApi.ts).
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Pencil, Plus, Trash2, Undo2, Check, PackageOpen } from "lucide-react";
import toast from "react-hot-toast";
import {
  Drawer, EmptyState, ErrorState, GhostButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { rentalsAdmin, type AdminRental, type RentalsList } from "./rentalsApi";
import { blankItem, formFromItem, isLate, itemToSave, lengthWords, priceLine, rentalTotals, statusOf, timelineRows, whenText, type ItemForm } from "./rentalsView";
import { moneyText } from "./eventsView";
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
                  <GhostButton icon={<Trash2 size={16} aria-hidden />} onClick={() => { void remove(item); }}>Delete</GhostButton>
                </div>
              </div>
              <p className="rnt-meta">
                {priceLine(item, money)} · {item.units === 1 ? "1 unit" : `${item.units} units`}
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
        <ul className="rnt-list" aria-label="Rentals">
          {coming.map((r) => {
            const status = statusOf(r);
            const late = isLate(r, nowMs);
            return (
              <li key={r.id} className="bkg-tile rnt-row">
                <div className="rnt-main">
                  <div className="rnt-who">
                    <strong>{r.name}</strong>
                    <StatusBadge tone={late ? "danger" : status.tone} glyph={false}>{late ? "Late back" : status.label}</StatusBadge>
                    {r.test && <StatusBadge tone="neutral" glyph={false}>Test</StatusBadge>}
                  </div>
                  <p className="rnt-when">{r.itemName}, unit {r.unit} · {whenText(r, data.zone)}</p>
                  <p className="rnt-meta">{lengthWords(r)} · {r.email}</p>
                </div>
                <div className="rnt-side">
                  <p className="rnt-amount">{money(r.chargedMinor)}{r.taxMinor > 0 && <small>includes {money(r.taxMinor)} tax</small>}</p>
                  <div className="rnt-actions">
                    {r.status === "paid" && <SecondaryButton icon={<Check size={16} aria-hidden />} busy={busy === `pickedUp:${r.id}`} onClick={() => { void step(r, "pickedUp"); }}>Picked up</SecondaryButton>}
                    {(r.status === "paid" || r.status === "out") && <SecondaryButton icon={<Undo2 size={16} aria-hidden />} busy={busy === `returned:${r.id}`} onClick={() => { void step(r, "returned"); }}>Returned</SecondaryButton>}
                    {r.status === "paid" && <GhostButton busy={busy === `cancel:${r.id}`} onClick={() => { void step(r, "cancel"); }}>Cancel</GhostButton>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmNode}
      {editing && <ItemDrawer start={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
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
        <div key={row.unit} className="rnt-tl-row" role="row" data-repair={row.repair || undefined}>
          <span className="rnt-tl-unit" role="rowheader">{row.unit}{row.repair ? " · repair" : ""}</span>
          <div className="rnt-tl-track" role="cell">
            {row.bars.map((b) => (
              <span key={b.rental.id} className="rnt-tl-bar" data-status={b.rental.status} data-late={b.late || undefined} style={{ left: `${b.left}%`, width: `${b.width}%` }}
                title={`${b.rental.name}, ${whenText(b.rental, zone)}`}>
                <span className="rnt-tl-label">{b.rental.name}</span>
              </span>
            ))}
            {row.bars.length === 0 && <span className="rnt-tl-free">{row.repair ? "Out for repair" : "Free all week"}</span>}
          </div>
        </div>
      ))}
    </div>
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
        <Toggle label="Add sales tax" checked={form.chargeTax} onChange={(v) => set("chargeTax", v)} />
        <Toggle label="Show on your Rentals page" checked={form.status === "live"} onChange={(v) => set("status", v ? "live" : "draft")} />
        {problem && <p className="rnt-problem" role="alert">{problem}</p>}
      </div>
    </Drawer>
  );
}
