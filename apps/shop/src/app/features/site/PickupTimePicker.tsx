// Checkout's pickup time: a row of days, then that day's open times. Shown under the delivery choices while pickup is
// chosen and the shop asks for a time (pickupTimes.ts). Display only: Checkout.tsx keeps the choice and sends it.
import { useState } from "react";
import { regionProps } from "./storefrontRegions";
import { pickupDayLabel, pickupTimeLabel, pickupWhen, type PickupTimes } from "./pickupTimes";

type Words = { title: string; note: string; days: string; times: string; loading: string; none: string; choose: string; chosen: string };

export function PickupTimePicker({ times, loading, value, onChange, words, locale, invalid = false }: {
  times: PickupTimes | null; loading: boolean; value: string; onChange: (iso: string) => void; words: Words; locale?: string; invalid?: boolean;
}) {
  const days = times?.on ? Object.keys(times.days).sort() : [];
  const chosenDay = days.find((d) => times?.on && times.days[d].includes(value)) || "";
  const [picked, setPicked] = useState("");
  const day = chosenDay || (days.includes(picked) ? picked : days[0] || "");
  if (!loading && !times?.on) return null;
  const zone = times?.on ? times.zone : "UTC";
  return (
    <section {...regionProps("checkoutFulfillment")} className="fm-co-box fm-co-pickup flex flex-col gap-4" aria-labelledby="fm-co-pickup-title" data-pickup-times>
      <div>
        <h3 id="fm-co-pickup-title" className="fm-co-mono">{words.title}</h3>
        {words.note && <p className="fm-co-note mt-1">{words.note}</p>}
      </div>
      {loading ? <p className="fm-co-note" role="status">{words.loading}</p> : !days.length ? <p className="fm-co-note" role="status">{words.none}</p> : <>
        <div className="fm-co-pickup-days" role="group" aria-label={words.days}>
          {days.map((d) => {
            const label = pickupDayLabel(d, locale);
            return <button key={d} type="button" className="fm-co-pickup-day" aria-pressed={d === day} data-day={d}
              onClick={() => { setPicked(d); if (d !== chosenDay) onChange(""); }}>
              <span className="fm-co-mono">{label.weekday}</span><span>{label.date}</span>
            </button>;
          })}
        </div>
        <div className="fm-co-pickup-times" role="radiogroup" aria-label={words.times} aria-invalid={invalid || undefined}>
          {(times?.on ? times.days[day] || [] : []).map((iso) => (
            <label key={iso} className="fm-co-pickup-time">
              <input type="radio" name="pickup-time" value={iso} checked={value === iso} onChange={() => onChange(iso)} />
              <span translate="no">{pickupTimeLabel(iso, zone, locale)}</span>
            </label>
          ))}
        </div>
        <p className="fm-co-note" role="status" data-pickup-chosen={value ? "" : undefined} data-pickup-missing={!value && invalid ? "" : undefined}>
          {value ? words.chosen.replace("{time}", pickupWhen(value, zone, locale)) : words.choose}
        </p>
      </>}
    </section>
  );
}
