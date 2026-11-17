// Home for a services shop (services plan, phase 1), in the same bento as HomeToday: the greeting, the To do tiles,
// then Today as appointments: how many, who is next, today's list and what is coming up. Bookings are followed live
// (bookingsApi), so a booking made on the website shows here without a refresh.
import { useContext, useEffect, useState, type ReactNode } from "react";
import { PageAlertsSlot, StatusBadge } from "../riso/components";
import { bookingsAdmin, followBookings, type Booking, type Waiting } from "../bookingsApi";
import { cardText, dayText, moneyText, paymentText, timeText } from "../bookingsView";
import { addDays, balanceDue, dayOf } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { greeting } from "./HomeToday";
import { HOME_BAR_DAYS, HOME_BOOKINGS_AHEAD_DAYS, HOME_BOOKINGS_BACK_DAYS, servicesDay, startsIn, todayLine } from "./servicesHome";
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

/** How many people wait for a place in the next week (op waitlist), null until read; a failed read counts as none. */
function useWaiting(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const from = dayOf(Date.now(), ZONE);
    bookingsAdmin<{ waiting: Waiting[] }>("waitlist", { from, to: addDays(from, 7) })
      .then((a) => { if (live) setCount((a.waiting || []).length); }).catch(() => { if (live) setCount(0); });
    return () => { live = false; };
  }, [enabled]);
  return count;
}

/** Where a booking's money stands, in a few words, for the Next client tile. */
function moneyLine(b: Booking): string {
  if (b.priceMinor === 0 && b.payment !== "pack") return "Free";
  const due = balanceDue(b);
  const paid = b.payment === "pack" ? `Visit ${b.pack?.visit || ""} of a pack`.replace("  ", " ") : due === 0 ? "Paid" : b.depositPaid ? `Deposit paid · ${moneyText(due, b.currency)} to pay` : `${moneyText(due, b.currency)} to pay at the visit`;
  return b.card?.last4 ? `${paid} · ${cardText(b.card)} saved` : paid;
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
  const waiting = useWaiting(Array.isArray(bookings));
  // Clients, searched to this one (Customers reads `#customers?q=`).
  const openClient = (email: string) => { window.location.hash = `customers?q=${encodeURIComponent(email)}`; };

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
          <article className="rp-home-tile" data-tone="mint" aria-labelledby="home-next">
            <span className="rp-home-kicker" id="home-next">Next client</span>
            {!day ? <span className="rp-home-line">{empty}</span>
              : !day.next ? <>
                  <strong className="rp-home-mid">{day.today.length ? "All done" : "Free day"}</strong>
                  <span className="rp-home-line">{day.today.length ? `${todayLine(day.today.length)}, all finished.` : "Nothing booked today."}{day.upcoming[0] ? ` Next: ${when(Date.parse(day.upcoming[0].start), { weekday: "long" })} at ${timeText(day.upcoming[0].start, ZONE)}.` : ""}</span>
                </>
              : <>
                  <strong className="rp-home-big">{timeText(day.next.start, ZONE)} <small className="rp-home-in">{startsIn(day.next.start, now)}</small></strong>
                  <span className="rp-home-who">{day.next.customer.name}</span>
                  <span className="rp-home-line">{day.next.serviceName}{day.next.staffName ? ` with ${day.next.staffName}` : ""}{day.next.roomName ? ` · ${day.next.roomName}` : ""}</span>
                  <span className="rp-home-line">{moneyLine(day.next)}</span>
                </>}
            <div className="rp-home-foot rp-home-chips">
              {day?.next && <button type="button" className="rp-home-chip" onClick={() => openClient(day.next!.customer.email)}>Open client</button>}
              <button type="button" className="rp-home-chip" data-ghost onClick={() => onOpen("bookings")}>Calendar</button>
            </div>
          </article>

          <article className="rp-home-card" aria-labelledby="home-appointments">
            <div className="rp-home-card-head">
              <h3 className="rp-home-h3" id="home-appointments">Today · {day ? day.today.length : wait}</h3>
            </div>
            {!day ? <p className="rp-home-empty">{empty}</p>
              : !day.today.length ? <p className="rp-home-empty">Nothing booked today. New bookings show here the moment they're made.</p>
              : (
                <ul className="rp-home-rows">
                  {day.today.slice(0, 6).map((b) => (
                    <li key={b.id} className="rp-home-order" data-past={Date.parse(b.end) <= now || undefined}>
                      <span className="rp-mono">{timeText(b.start, ZONE)}</span>
                      <span className="rp-home-name"><strong>{b.customer.name}</strong> · {b.serviceName}{b.staffName ? ` · ${b.staffName}` : ""}</span>
                      <span className="rp-home-money">{b.priceMinor > 0 ? moneyText(b.priceMinor, b.currency) : ""}</span>
                      {b.noShow ? <StatusBadge tone="danger" glyph={false}>No-show</StatusBadge>
                        : b.priceMinor === 0 ? <StatusBadge tone="neutral" glyph={false}>{b.payment === "pack" ? "Pack" : "Free"}</StatusBadge>
                        : b.paid ? <StatusBadge tone="success" glyph={false}>Paid</StatusBadge>
                        : <StatusBadge tone="warning" glyph={false}><span title={paymentText(b)}>{b.depositPaid ? `${moneyText(balanceDue(b), b.currency)} to pay` : "To pay"}</span></StatusBadge>}
                    </li>
                  ))}
                  {day.today.length > 6 && <li><button type="button" className="rp-home-link" onClick={() => onOpen("bookings")}>and {day.today.length - 6} more in Calendar →</button></li>}
                </ul>
              )}
          </article>

          <article className="rp-home-tile" data-tone="ink" aria-labelledby="home-needs">
            <span className="rp-home-kicker" id="home-needs">Needs you</span>
            {!day ? <span className="rp-home-line">{empty}</span>
              : !day.fees.length && !waiting ? <p className="rp-home-line rp-home-calm">Nothing right now. Missed visits you can charge for and people waiting for a place show here.</p>
              : (
                <ul className="rp-home-needs">
                  {day.fees.slice(0, 3).map((b) => (
                    <li key={b.id}>
                      <span><strong>{b.customer.name} {b.noShow ? "didn't come" : "was cancelled"}</strong><small>{when(Date.parse(b.start), { weekday: "short", month: "short", day: "numeric" })} · {cardText(b.card)} saved</small></span>
                      <button type="button" className="rp-home-chip" data-light onClick={() => onOpen("bookings")}>Charge {moneyText(b.lateFeeMinor || 0, b.currency)}</button>
                    </li>
                  ))}
                  {day.fees.length > 3 && <li><span><small>and {day.fees.length - 3} more missed visits to charge</small></span></li>}
                  {!!waiting && (
                    <li>
                      <span><strong>{waiting} waiting for a place</strong><small>On the waitlist for the next week</small></span>
                      <button type="button" className="rp-home-chip" data-ghost onClick={() => onOpen("bookings")}>See</button>
                    </li>
                  )}
                </ul>
              )}
          </article>

          <article className="rp-home-card" aria-labelledby="home-taken">
            <h3 className="rp-home-h3" id="home-taken">Taken today</h3>
            <strong className="rp-home-mid">{day ? moneyText(day.taken.keptMinor + day.taken.tipsMinor, day.taken.currency || SHOP_CURRENCY) : wait}</strong>
            <span className="rp-home-line rp-home-muted">{day ? (day.taken.tipsMinor ? `Including ${moneyText(day.taken.tipsMinor, day.taken.currency || SHOP_CURRENCY)} in tips` : "From today's appointments, after refunds") : ""}</span>
          </article>

          <article className="rp-home-tile" data-tone="sky" aria-label="The next seven days">
            <span className="rp-home-kicker">Next 7 days</span>
            <strong className="rp-home-mid">{day ? `${day.week.count} booked` : wait}</strong>
            {day && <span className="rp-home-line">{day.week.hours} {day.week.hours === 1 ? "hour" : "hours"} of appointments{day.week.takenMinor > 0 ? ` · ${moneyText(day.week.takenMinor, day.today[0]?.currency || day.upcoming[0]?.currency || SHOP_CURRENCY)} paid` : ""}</span>}
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
