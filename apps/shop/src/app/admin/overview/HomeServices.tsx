// Home for a services shop (services plan, phase 1), in the same bento as HomeToday: the greeting, the To do tiles,
// then Today as appointments: how many, who is next, today's list and what is coming up. Bookings are followed live
// (bookingsApi), so a booking made on the website shows here without a refresh.
import { useContext, useEffect, useState, type ReactNode } from "react";
import { PageAlertsSlot, StatusBadge } from "../riso/components";
import { followBookings, type Booking } from "../bookingsApi";
import { dayText, moneyText, paymentText, timeText } from "../bookingsView";
import { balanceDue, dayOf } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { greeting } from "./HomeToday";
import { HOME_BAR_DAYS, HOME_BOOKINGS_AHEAD_DAYS, HOME_BOOKINGS_BACK_DAYS, servicesDay, todayLine } from "./servicesHome";
import { SHOP_CURRENCY } from "../moneySign";
import "./home.css";

const ZONE = shopTimeZone();
const DAY = 86_400_000;
const when = (now: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone: ZONE, ...opts }).format(now);

/** The shop's bookings around today, followed live: null while loading, "error" when they couldn't be read. */
export function useHomeBookings(enabled: boolean): Booking[] | null | "error" {
  const [rows, setRows] = useState<Booking[] | null | "error">(null);
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    return followBookings(new Date(now - HOME_BOOKINGS_BACK_DAYS * DAY).toISOString(), new Date(now + HOME_BOOKINGS_AHEAD_DAYS * DAY).toISOString(),
      setRows, () => setRows("error"));
  }, [enabled]);
  return rows;
}

export function HomeServices({ ownerName, bookings, todo, onOpen }: {
  ownerName: string;
  bookings: Booking[] | null | "error";
  /** The To do tiles (HomePage's RunTiles). */
  todo: ReactNode;
  onOpen: (tab: string) => void;
}) {
  const alerts = useContext(PageAlertsSlot);
  const now = Date.now();
  const failed = bookings === "error";
  const day = Array.isArray(bookings) ? servicesDay(bookings, now, ZONE) : null;
  const wait = failed ? "—" : "…";
  const max = day ? Math.max(...day.bars, 0) : 0;
  const empty = failed ? "Couldn't load your calendar." : "Loading…";

  return (
    <div className="rp-home">
      <header className="rp-home-head">
        <div>
          <h1 className="rp-home-title">{greeting(ownerName, now)}</h1>
          <p className="rp-home-sub">{when(now, { weekday: "long", day: "numeric", month: "long" })} · your to-do list and today's appointments</p>
        </div>
      </header>
      {alerts}

      <section aria-labelledby="home-todo">
        <h2 className="rp-home-h2" id="home-todo">To do <small>Most urgent first</small></h2>
        {todo}
      </section>

      <section aria-labelledby="home-today">
        <h2 className="rp-home-h2" id="home-today">Today <button type="button" className="rp-home-link" onClick={() => onOpen("bookings")}>Calendar →</button></h2>
        <div className="rp-home-grid">
          <article className="rp-home-tile" data-tone="mint" aria-label="Today's appointments in numbers">
            <span className="rp-home-kicker">Today · {when(now, { weekday: "short", day: "numeric", month: "short" })}</span>
            <strong className="rp-home-big">{day ? day.today.length : wait}</strong>
            <span className="rp-home-line">
              {!day ? "" : !day.today.length ? "Nothing booked today."
                : day.next ? `Next: ${timeText(day.next.start, ZONE)} · ${day.next.customer.name} · ${day.next.serviceName}`
                : `${todayLine(day.today.length)}, all done.`}
            </span>
            {day && (
              <span className="rp-home-line">
                Next 7 days: {day.week.count} booked · {day.week.hours} {day.week.hours === 1 ? "hour" : "hours"}{day.week.takenMinor > 0 ? ` · ${moneyText(day.week.takenMinor, day.today[0]?.currency || day.upcoming[0]?.currency || SHOP_CURRENCY)} paid` : ""}
              </span>
            )}
            {day && (
              <div className="rp-home-bars" role="img" aria-label={`Appointments for the next ${HOME_BAR_DAYS} days, today first`}>
                {day.bars.map((v, i) => <span key={i} style={{ height: `${max > 0 ? Math.max(8, (v / max) * 100) : 8}%` }} data-today={i === 0 || undefined} />)}
              </div>
            )}
            {day && (
              <div className="rp-home-bars-key" aria-hidden="true">
                <span>Today</span>
                <span>{when(now + (HOME_BAR_DAYS - 1) * DAY, { month: "short", day: "numeric" })}</span>
              </div>
            )}
          </article>

          <article className="rp-home-card" aria-labelledby="home-appointments">
            <div className="rp-home-card-head">
              <h3 className="rp-home-h3" id="home-appointments">Today's appointments</h3>
            </div>
            {!day ? <p className="rp-home-empty">{empty}</p>
              : !day.today.length ? <p className="rp-home-empty">Nothing booked today. New bookings show here the moment they're made.</p>
              : (
                <ul className="rp-home-rows">
                  {day.today.slice(0, 6).map((b) => (
                    <li key={b.id} className="rp-home-order" data-past={Date.parse(b.end) <= now || undefined}>
                      <span className="rp-mono">{timeText(b.start, ZONE)}</span>
                      <span className="rp-home-name"><strong>{b.customer.name}</strong> · {b.serviceName}</span>
                      <span className="rp-home-money">{b.priceMinor > 0 ? moneyText(b.priceMinor, b.currency) : ""}</span>
                      {b.noShow ? <StatusBadge tone="danger" glyph={false}>No-show</StatusBadge>
                        : b.priceMinor === 0 ? <StatusBadge tone="neutral" glyph={false}>Free</StatusBadge>
                        : b.paid ? <StatusBadge tone="success" glyph={false}>Paid</StatusBadge>
                        : <StatusBadge tone="warning" glyph={false}><span title={paymentText(b)}>{b.depositPaid ? `${moneyText(balanceDue(b), b.currency)} to pay` : "To pay"}</span></StatusBadge>}
                    </li>
                  ))}
                  {day.today.length > 6 && <li><button type="button" className="rp-home-link" onClick={() => onOpen("bookings")}>and {day.today.length - 6} more in Calendar →</button></li>}
                </ul>
              )}
          </article>

          <article className="rp-home-card" aria-labelledby="home-upcoming">
            <h3 className="rp-home-h3" id="home-upcoming">Coming up</h3>
            {!day ? <p className="rp-home-empty">{empty}</p>
              : !day.upcoming.length ? <p className="rp-home-empty">Nothing booked for the next week yet.</p>
              : (
                <ul className="rp-home-rows">
                  {day.upcoming.slice(0, 5).map((b) => (
                    <li key={b.id} className="rp-home-next">
                      <span className="rp-mono">{dayText(dayOf(Date.parse(b.start), ZONE))} · {timeText(b.start, ZONE)}</span>
                      <span className="rp-home-name"><strong>{b.customer.name}</strong> · {b.serviceName}</span>
                    </li>
                  ))}
                </ul>
              )}
          </article>
        </div>
      </section>
    </div>
  );
}
