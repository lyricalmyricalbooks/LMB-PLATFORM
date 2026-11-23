// My bookings in the customer account (Bookings plan 4, 2.10, Beta): the visits booked with this account's verified email,
// coming ones first, then the last few past ones. Open asks the server for a fresh link to that booking (move, cancel,
// add to calendar all live there); a past one offers Book again. Shown while the shop takes bookings, or when the link
// `/account/bookings` is followed. The server decides what is listed (functions/bookings.js `bookingMine`). Words are
// Text & labels › Customer account › Your bookings.
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Link, useLocation, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { functionFetch } from "../../lib/functionsBase";
import { isBookingPreview, previewAnswer } from "./bookTimePreview";
import { whenText } from "./bookTimeRules";
import { useBookingsLive } from "./bookingsLive";

export type MyBooking = {
  id: string; serviceId: string; serviceName: string; start: string; end: string; location?: string; staffName?: string;
  status: string; noShow?: boolean; declined?: boolean; clientZone?: string; online?: boolean;
};
export type MyBookings = { on: boolean; zone: string; live: boolean; coming: MyBooking[]; past: MyBooking[] };

async function askMine(action: "bookingMine" | "bookingOpen", body: Record<string, unknown>, user: User): Promise<Record<string, any>> {
  if (isBookingPreview()) return previewAnswer(action, body);
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}

/** Whether the account page asks for bookings at all (a call per visit costs the shop). */
export function wantsBookingsCard(pathname: string, live: boolean) {
  return live || /\/account\/bookings\/?$/.test(pathname);
}

/** The words for a booking's state, "" for a plain confirmed one. */
export function bookingStateKey(b: Pick<MyBooking, "status" | "noShow" | "declined">, past: boolean): string {
  if (b.status === "cancelled") return b.declined ? "accountBookingsDeclined" : "accountBookingsCancelled";
  if (b.status === "requested") return "accountBookingsRequested";
  if (past && b.noShow) return "accountBookingsMissed";
  return "";
}

export function AccountBookings({ design, user }: { design: any; user: User }) {
  const { pathname } = useLocation();
  const live = useBookingsLive();
  return wantsBookingsCard(pathname, live || isBookingPreview()) ? <BookingsCard design={design} user={user} focus={/\/account\/bookings\/?$/.test(pathname)} /> : null;
}

function BookingsCard({ design, user, focus }: { design: any; user: User; focus: boolean }) {
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const navigate = useNavigate();
  const [data, setData] = useState<MyBookings | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState("");
  const [problem, setProblem] = useState("");
  const ref = useRef<HTMLElement>(null);

  const load = () => {
    setFailed(false);
    askMine("bookingMine", {}, user).then((a) => setData(a as MyBookings)).catch(() => setFailed(true));
  };
  useEffect(load, [user.uid]);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: "start" }); }, []);

  const open = async (b: MyBooking) => {
    // Studio's preview has sample bookings only, with no page behind them.
    if (opening || isBookingPreview()) return;
    setOpening(b.id); setProblem("");
    try {
      const answer = await askMine("bookingOpen", { id: b.id }, user);
      if (typeof answer.path === "string" && answer.path.startsWith("/book?")) { navigate(answer.path); return; }
      setProblem("accountBookingsOpenProblem");
    } catch {
      setProblem("accountBookingsOpenProblem");
    } finally {
      setOpening("");
    }
  };

  // Nothing to show and nothing to book: keep the account page quiet.
  if (data && !data.coming.length && !data.past.length && !data.live) return null;

  const row = (b: MyBooking, past: boolean) => {
    const state = bookingStateKey(b, past);
    const where = b.online ? c("accountBookingsOnline") : b.location || "";
    return (
      <li key={b.id} className="fm-acb-row">
        <div className="fm-acb-main">
          <p className="fm-acb-name">{b.serviceName}{state && <span className="fm-acb-state">{c(state)}</span>}</p>
          <p className="fm-acb-when">{whenText(b.start, b.end, b.clientZone || data!.zone)}</p>
          {(b.staffName || where) && <p className="fm-acb-meta">{[b.staffName ? c("accountBookingsWith", { name: b.staffName }) : "", where].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="fm-acb-actions">
          {!past && (
            <button type="button" className="fm-track-btn" disabled={!!opening} aria-busy={opening === b.id} onClick={() => open(b)}>
              {opening === b.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}{c("accountBookingsOpen")}
            </button>
          )}
          {past && data!.live && b.serviceId && <Link className="fm-track-btn fm-track-btn-ghost" to={`/book?service=${encodeURIComponent(b.serviceId)}`}>{c("accountBookingsAgain")}</Link>}
        </div>
      </li>
    );
  };

  return (
    <section ref={ref} id="bookings" {...regionProps("accountBookings")} className="glass-card border border-white/5 rounded-[2.5rem] p-10 space-y-5 scroll-mt-24">
      <style>{ACCOUNT_BOOKINGS_CSS}</style>
      <h2 className="text-xs font-black tracking-[0.5em] text-white/30 uppercase">{c("accountBookingsHeading")}</h2>
      {failed ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm fm-danger-text">{c("accountBookingsLoadProblem")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("accountBookingsRetry")}</button>
        </div>
      ) : !data ? (
        <p role="status" className="text-sm fm-muted"><Loader2 size={14} className="animate-spin inline-block" aria-hidden="true" /> {c("accountBookingsLoading")}</p>
      ) : (
        <>
          {data.coming.length ? (
            <ul className="fm-acb-list" aria-label={c("accountBookingsComing")}>{data.coming.map((b) => row(b, false))}</ul>
          ) : (
            <p className="text-sm leading-6 fm-muted">{c("accountBookingsNone")} {data.live && <Link to="/book" className="underline">{c("accountBookingsBook")}</Link>}</p>
          )}
          {!!data.past.length && (
            <div className="fm-acb-past">
              <h3>{c("accountBookingsPast")}</h3>
              <ul className="fm-acb-list">{data.past.map((b) => row(b, true))}</ul>
            </div>
          )}
          {problem && <p role="alert" className="text-sm fm-danger-text">{c(problem)}</p>}
        </>
      )}
    </section>
  );
}

// Token-driven only: every colour comes from the theme (as the membership card's rows).
const ACCOUNT_BOOKINGS_CSS = [
  `.fm-acb-list{margin:0;padding:0;list-style:none;display:grid;}`,
  `.fm-acb-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;padding:16px 0;min-width:0;}`,
  `.fm-acb-row + .fm-acb-row{border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `.fm-acb-list > .fm-acb-row:first-child{padding-top:0;}`,
  `.fm-acb-main{display:grid;gap:4px;min-width:0;flex:1 1 16rem;}`,
  `.fm-acb-main p{margin:0;}`,
  `.fm-acb-actions{display:flex;flex-wrap:wrap;gap:12px;}`,
  `.fm-acb-name{font-size:16px;font-weight:700;line-height:1.35;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;}`,
  `.fm-acb-state{font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid color-mix(in srgb, currentColor 30%, transparent);}`,
  `.fm-acb-when{font-size:15px;font-variant-numeric:tabular-nums;}`,
  `.fm-acb-meta{font-size:14px;color:var(--muted, currentColor);overflow-wrap:anywhere;}`,
  `.fm-acb-past{display:grid;gap:12px;padding-top:20px;border-top:1px solid color-mix(in srgb, currentColor 14%, transparent);}`,
  `.fm-acb-past h3{margin:0;font-size:14px;font-weight:700;color:var(--muted, currentColor);}`,
  `.fm-acb-past .fm-acb-name{font-size:15px;}`,
  `@media (max-width:560px){.fm-acb-row .fm-acb-actions,.fm-acb-row .fm-track-btn{width:100%;}}`,
].join("");
