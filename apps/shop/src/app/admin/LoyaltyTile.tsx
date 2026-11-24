// Bookings › Hours & rules › Loyalty points (plan 4, 5.5, Beta): clients earn points on visits and paid shop orders, and
// at the level set here the points become a one-use money-off code, emailed to them (functions/bookings.js sweepLoyalty).
import { Plus, Trash2 } from "lucide-react";
import { IconButton, SecondaryButton, SelectField, StatusBadge, TextField, Toggle } from "./riso/components";
import { BONUS_TIMES, cleanLoyalty, LOYALTY_DEFAULTS, MAX_BONUS_WEEKS, REWARD_DAY_CHOICES, visitPoints, type BonusWeek, type LoyaltySettings } from "../../shared/loyalty";
import type { BookingSettings } from "../../shared/bookingTimes";
import { moneyText } from "./bookingsView";
import { MONEY_SIGN, SHOP_CURRENCY } from "./moneySign";

const PER_DOLLAR = [0, 1, 2, 3, 5, 10];
const REWARD_AT = [50, 100, 150, 200, 250, 500, 1000];

/** Today and a week on, as "YYYY-MM-DD" on the shop's clock. */
function nextWeek(zone: string): BonusWeek {
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  return { from: day(Date.now()), to: day(Date.now() + 6 * 86400000), times: 2 };
}

export function LoyaltyTile({ form, zone, onChange }: {
  form: BookingSettings;
  zone: string;
  onChange: (patch: Pick<BookingSettings, "loyalty">) => void;
}) {
  // Bonus weeks as typed, so a row half-way through an edit (the end before the start) stays on screen; saving cleans them.
  const s: LoyaltySettings = form.loyalty ? { ...cleanLoyalty(form.loyalty), bonusWeeks: Array.isArray(form.loyalty.bonusWeeks) ? form.loyalty.bonusWeeks : [] } : { ...LOYALTY_DEFAULTS };
  const set = (patch: Partial<LoyaltySettings>) => onChange({ loyalty: { ...s, ...patch } });
  const setWeek = (i: number, patch: Partial<BonusWeek>) => set({ bonusWeeks: s.bonusWeeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const example = visitPoints({ ...s, on: true, bonusWeeks: [] }, 6000, "");
  const summary = s.perDollar === 0 && s.perVisit === 0
    ? "Nothing earns points yet. Choose points for each dollar or for each visit."
    : `A ${moneyText(6000, SHOP_CURRENCY)} visit earns ${example} point${example === 1 ? "" : "s"}. Every ${s.rewardPoints} points give ${moneyText(s.rewardMinor, SHOP_CURRENCY)} off.`;
  return (
    <section className="bkg-tile" data-loyalty-tile>
      <h2 className="bkg-tile-title">Loyalty points <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <div className="bkg-form">
        <Toggle label="Give clients points" checked={s.on} onChange={(v) => set({ on: v })} />
        <p className="bkg-cal-text">{s.on
          ? "Clients earn points the day after a visit, and an hour after a paid order. When they reach a reward, they get a one-use code by email for money off a booking or an order."
          : "Clients don't earn points."}</p>
        {s.on && <>
          <div className="bkg-loyalty-grid">
            <SelectField label="Points for each dollar" value={String(s.perDollar)} onChange={(e) => set({ perDollar: Number(e.target.value) })}>
              {PER_DOLLAR.map((n) => <option key={n} value={n}>{n === 0 ? "None" : `${n} point${n === 1 ? "" : "s"}`}</option>)}
            </SelectField>
            <TextField label="Extra points for each visit" type="number" inputMode="numeric" min={0} max={1000} value={String(s.perVisit)}
              onChange={(e) => set({ perVisit: Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))) })} />
            <SelectField label="A reward at" value={String(s.rewardPoints)} onChange={(e) => set({ rewardPoints: Number(e.target.value) })}>
              {[...new Set([...REWARD_AT, s.rewardPoints])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} points</option>)}
            </SelectField>
            <TextField label={`The reward takes off (${MONEY_SIGN})`} type="number" inputMode="decimal" min={1} max={1000} step="1" value={String(s.rewardMinor / 100)}
              onChange={(e) => set({ rewardMinor: Math.max(100, Math.min(100000, Math.round((Number(e.target.value) || 0) * 100))) })} />
            <SelectField label="The code works for" value={String(s.rewardDays)} onChange={(e) => set({ rewardDays: Number(e.target.value) })}>
              {REWARD_DAY_CHOICES.map((d) => <option key={d} value={d}>{d === 365 ? "A year" : `${d} days`}</option>)}
            </SelectField>
          </div>
          <Toggle label="Shop orders earn points too" checked={s.onOrders} onChange={(v) => set({ onOrders: v })} />
          <p className="bkg-loyalty-summary" data-loyalty-summary>{summary}</p>

          <h3 className="bkg-loyalty-sub">Bonus weeks</h3>
          <p className="bkg-cal-text">Points count double or triple on these days, for visits and orders alike.</p>
          {s.bonusWeeks.length > 0 && (
            <ul className="bkg-loyalty-weeks">
              {s.bonusWeeks.map((w, i) => (
                <li key={i} className="bkg-loyalty-week">
                  <TextField label="From" type="date" value={w.from} onChange={(e) => setWeek(i, { from: e.target.value })} />
                  <TextField label="To" type="date" value={w.to} min={w.from} onChange={(e) => setWeek(i, { to: e.target.value })}
                    error={w.from && w.to && w.to < w.from ? "Ends before it starts." : undefined} />
                  <SelectField label="Points" value={String(w.times)} onChange={(e) => setWeek(i, { times: Number(e.target.value) })}>
                    {BONUS_TIMES.map((t) => <option key={t} value={t}>{t === 2 ? "Double" : "Triple"}</option>)}
                  </SelectField>
                  <IconButton label="Remove this bonus week" tone="danger" onClick={() => set({ bonusWeeks: s.bonusWeeks.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></IconButton>
                </li>
              ))}
            </ul>
          )}
          {s.bonusWeeks.length < MAX_BONUS_WEEKS && (
            <div><SecondaryButton type="button" onClick={() => set({ bonusWeeks: [...s.bonusWeeks, nextWeek(zone)] })}><Plus size={16} aria-hidden /> Add a bonus week</SecondaryButton></div>
          )}
          <p className="bkg-cal-text">Each client's points are on their card in Customers, where you can add or take points. Change the reward email's words under Emails and texts to clients.</p>
        </>}
      </div>
    </section>
  );
}
