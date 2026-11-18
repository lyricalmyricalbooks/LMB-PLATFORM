// The account's membership card (Memberships beta): state, plan, next payment or end, the card on file, and Cancel,
// Keep my membership and Use a new card. `/account/membership` (the emails' link) scrolls here; `?joined=<id>` is the
// card provider's way back after joining (it asks again while the payment settles), `?card=<id>` after a new card, and
// `?join=<plan>` is a guest who chose a plan on the Membership page and has now signed in. The server decides
// everything; words are Text & labels › Customer account › Membership. A box membership (M3) also shows where the boxes go,
// with Add or Change address (the server checks it, `membershipAddress`).
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { askMembership, type MyMembership } from "./membershipAsk";
import { moneyText } from "./bookTimeRules";
import { MEMBERSHIP_CSS } from "./membershipStyle";
import { addressLine, memberCan, memberNext, membershipErrorKey, memberStateKey, planEveryKey } from "./membershipWords";
import type { BoxAddress } from "../../../shared/membershipRules";
import { useMembershipsLive } from "./membershipLive";

const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

/** "December 2026" for a box month (YYYY-MM). */
const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return y && m ? new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : month;
};

/** Whether the account page should ask for memberships at all (a call per visit costs the shop). */
export function wantsMembershipCard(pathname: string, search: string, live: boolean) {
  const q = new URLSearchParams(search);
  return live || /\/account\/membership\/?$/.test(pathname) || q.has("joined") || q.has("card") || q.has("join");
}

export function AccountMembership({ design, user }: { design: any; user: User }) {
  const { pathname, search } = useLocation();
  const live = useMembershipsLive();
  const shown = wantsMembershipCard(pathname, search, live);
  return shown ? <MembershipCard design={design} user={user} pathname={pathname} search={search} /> : null;
}

function MembershipCard({ design, user, pathname, search }: { design: any; user: User; pathname: string; search: string }) {
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const q = new URLSearchParams(search);
  const joined = q.get("joined") || "";
  const joinPlan = q.get("join") || "";
  const [rows, setRows] = useState<MyMembership[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState(q.has("card") ? "accountMemberCardSaved" : "");
  const [editing, setEditing] = useState("");
  const ref = useRef<HTMLElement>(null);
  const tries = useRef(0);

  const load = () => {
    setFailed(false);
    askMembership("membershipMine", {}, user).then((a) => setRows((a.memberships || []) as MyMembership[])).catch(() => setFailed(true));
  };
  useEffect(load, [user.uid]);
  useEffect(() => {
    if (/\/account\/membership\/?$/.test(pathname) || joined || joinPlan) ref.current?.scrollIntoView({ block: "start" });
  }, []);
  // Back from the card page: the payment can take a few seconds to settle, so ask again a few times.
  useEffect(() => {
    if (!joined || !rows) return;
    const mine = rows.find((r) => r.id === joined);
    if (mine && mine.state !== "pending") return;
    if (tries.current >= 6) return;
    tries.current += 1;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [rows, joined]);

  const act = async (action: "membershipCancel" | "membershipResume" | "membershipCard" | "membershipSkip" | "membershipUnskip" | "membershipPause" | "membershipUnpause", m: MyMembership) => {
    if (busy) return;
    if (action === "membershipCancel" && !window.confirm(c("accountMemberCancelConfirm"))) return;
    if (action === "membershipPause" && !window.confirm(c("accountMemberPauseConfirm"))) return;
    setBusy(action); setProblem(""); setNote("");
    try {
      const answer = await askMembership(action, { id: m.id }, user);
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      if (answer.membership) setRows((now) => (now || []).map((r) => (r.id === m.id ? (answer.membership as MyMembership) : r)));
      if (action === "membershipCancel") setNote("accountMemberCancelled");
      if (action === "membershipResume") setNote("accountMemberResumed");
      if (action === "membershipPause") setNote("accountMemberPaused");
      if (action === "membershipUnpause") setNote("accountMemberUnpaused");
    } catch (err: any) {
      setProblem(membershipErrorKey(err?.code, err?.status));
    } finally {
      setBusy("");
    }
  };

  const saveAddress = async (m: MyMembership, address: BoxAddress) => {
    if (busy) return;
    setBusy("membershipAddress"); setProblem(""); setNote("");
    try {
      const answer = await askMembership("membershipAddress", { id: m.id, address }, user);
      if (answer.membership) setRows((now) => (now || []).map((r) => (r.id === m.id ? (answer.membership as MyMembership) : r)));
      setEditing(""); setNote("accountMemberAddressSaved");
    } catch (err: any) {
      setProblem(membershipErrorKey(err?.code, err?.status));
    } finally {
      setBusy("");
    }
  };

  const finishJoin = async () => {
    if (busy) return;
    setBusy("join"); setProblem("");
    try {
      const answer = await askMembership("membershipJoin", { planId: joinPlan }, user);
      if (answer.url) { window.location.assign(String(answer.url)); return; }
      setProblem("membershipErrorGeneric");
    } catch (err: any) {
      setProblem(membershipErrorKey(err?.code, err?.status));
    } finally {
      setBusy("");
    }
  };

  const running = (rows || []).filter((r) => r.state !== "ended");
  const ended = (rows || []).filter((r) => r.state === "ended").slice(0, 1);
  const shownRows = running.length ? running : ended;

  return (
    <section ref={ref} id="membership" {...regionProps("accountMembership")} className="glass-card border border-white/5 rounded-[2.5rem] p-10 space-y-5 scroll-mt-24">
      <style>{MEMBERSHIP_CSS}</style>
      <h2 className="text-xs font-black tracking-[0.5em] text-white/30 uppercase">{c("accountMemberHeading")}</h2>
      {failed ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm fm-danger-text">{c("accountMemberLoadProblem")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("membershipRetry")}</button>
        </div>
      ) : !rows ? (
        <p role="status" className="text-sm fm-muted"><Loader2 size={14} className="animate-spin inline-block" aria-hidden="true" /> {c("membershipLoading")}</p>
      ) : (
        <>
          {joined && running.some((r) => r.id === joined && r.state !== "pending") && <p role="status" className="text-sm leading-6">{c("accountMemberWelcome")}</p>}
          {joined && !running.some((r) => r.id === joined && r.state !== "pending") && <p role="status" className="text-sm leading-6 fm-muted">{c("accountMemberSettling")}</p>}
          {!shownRows.length && !joinPlan && <p className="text-sm leading-6 fm-muted">{c("accountMemberNone")} <a href="/membership" className="underline">{c("accountMemberSeePlans")}</a></p>}
          {joinPlan && !running.some((r) => r.state !== "pending") && (
            <div className="space-y-3">
              <p className="text-sm leading-6">{c("accountMemberFinishJoin")}</p>
              <button type="button" className="fm-track-btn" disabled={!!busy} aria-busy={busy === "join"} onClick={finishJoin}>{c("accountMemberContinue")}</button>
            </div>
          )}
          {shownRows.map((m) => {
            const next = memberNext(m);
            const can = memberCan(m.state);
            return (
              <div key={m.id} className="space-y-4">
                <dl className="fm-mbr-facts">
                  <div><dt>{c("accountMemberPlan")}</dt><dd>{m.plan?.name || ""}</dd></div>
                  <div><dt>{c("accountMemberStatus")}</dt><dd>{c(memberStateKey(m.state))}{m.test ? ` · ${c("accountMemberTest")}` : ""}</dd></div>
                  {m.plan && <div><dt>{c("accountMemberPrice")}</dt><dd translate="no">{moneyText(m.plan.priceMinor, m.plan.currency || "CAD")} {c(planEveryKey(m.plan.interval))}</dd></div>}
                  {next && <div><dt>{c("accountMemberWhen")}</dt><dd>{c(next.key, { date: next.at ? dateText(next.at) : "" })}</dd></div>}
                  {m.card && can.card && <div><dt>{c("accountMemberCard")}</dt><dd>{c("accountMemberCardEnding", { brand: m.card.brand ? m.card.brand[0].toUpperCase() + m.card.brand.slice(1) : "", last4: m.card.last4 })}</dd></div>}
                </dl>
                {m.box && m.state !== "ended" && m.state !== "pending" && (
                  <BoxAddressPart c={c} m={m} editing={editing === m.id} busy={busy} onEdit={(on) => { setEditing(on ? m.id : ""); setProblem(""); setNote(""); }} onSave={(a) => saveAddress(m, a)} />
                )}
                {m.box && m.skipMonth && m.state === "active" && (
                  <p className="text-sm leading-6">{c(m.plan?.interval === "month" ? "accountMemberSkipLineMonthly" : "accountMemberSkipLine", { month: monthName(m.skipMonth) })}</p>
                )}
                {m.cardPending && <p role="status" className="text-sm fm-muted">{c("accountMemberCardPending")}</p>}
                {(can.cancel || can.resume || can.card || can.unpause) && (
                  <div className="fm-mbr-actions">
                    {can.unpause && <button type="button" className="fm-track-btn" disabled={!!busy} aria-busy={busy === "membershipUnpause"} onClick={() => act("membershipUnpause", m)}>{c("accountMemberUnpause")}</button>}
                    {m.box && can.skip && !m.skipMonth && <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={!!busy} aria-busy={busy === "membershipSkip"} onClick={() => act("membershipSkip", m)}>{c("accountMemberSkip")}</button>}
                    {m.box && can.skip && !!m.skipMonth && <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={!!busy} aria-busy={busy === "membershipUnskip"} onClick={() => act("membershipUnskip", m)}>{c("accountMemberUnskip")}</button>}
                    {can.card && <button type="button" className={m.state === "pastDue" ? "fm-track-btn" : "fm-track-btn fm-track-btn-ghost"} disabled={!!busy} aria-busy={busy === "membershipCard"} onClick={() => act("membershipCard", m)}>{c("accountMemberNewCard")}</button>}
                    {can.resume && <button type="button" className="fm-track-btn" disabled={!!busy} aria-busy={busy === "membershipResume"} onClick={() => act("membershipResume", m)}>{c("accountMemberResume")}</button>}
                    {can.pause && <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={!!busy} aria-busy={busy === "membershipPause"} onClick={() => act("membershipPause", m)}>{c("accountMemberPause")}</button>}
                    {can.cancel && <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={!!busy} aria-busy={busy === "membershipCancel"} onClick={() => act("membershipCancel", m)}>{c("accountMemberCancel")}</button>}
                  </div>
                )}
              </div>
            );
          })}
          {note && <p role="status" className="text-sm leading-6">{c(note)}</p>}
          {problem && <p role="alert" className="text-sm fm-danger-text">{c(problem)}</p>}
        </>
      )}
    </section>
  );
}

type Copy = (key: string, vars?: Record<string, string | number>) => string;
const BLANK: BoxAddress = { name: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "CA" };

/** Where a box membership's boxes go: the address with Change, or a prompt and the form when there is none yet. */
function BoxAddressPart({ c, m, editing, busy, onEdit, onSave }: { c: Copy; m: MyMembership; editing: boolean; busy: string; onEdit: (on: boolean) => void; onSave: (a: BoxAddress) => void }) {
  const [form, setForm] = useState<BoxAddress>(m.address || BLANK);
  useEffect(() => { if (editing) setForm(m.address || BLANK); }, [editing]);
  const set = (patch: Partial<BoxAddress>) => setForm((f) => ({ ...f, ...patch }));
  const id = (k: string) => `mbr-addr-${m.id}-${k}`;
  if (!editing) {
    return (
      <div className="fm-mbr-ship">
        {m.address ? (
          <dl className="fm-mbr-facts"><div><dt>{c("accountMemberShipsTo")}</dt><dd translate="no">{m.address.name}<br />{addressLine(m.address)}</dd></div></dl>
        ) : <p className="text-sm leading-6">{c("accountMemberNoAddress")}</p>}
        <div className="fm-mbr-actions">
          <button type="button" className={m.address ? "fm-track-btn fm-track-btn-ghost" : "fm-track-btn"} disabled={!!busy} onClick={() => onEdit(true)}>{c(m.address ? "accountMemberChangeAddress" : "accountMemberAddAddress")}</button>
        </div>
      </div>
    );
  }
  const field = (k: keyof BoxAddress, label: string, auto: string, opts: { required?: boolean; wide?: boolean } = {}) => (
    <div className={opts.wide ? "fm-mbr-field fm-mbr-wide" : "fm-mbr-field"}>
      <label htmlFor={id(k)}>{c(label)}</label>
      <input id={id(k)} autoComplete={auto} required={opts.required !== false} value={form[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </div>
  );
  return (
    <form className="fm-mbr-address" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
      {field("name", "accountMemberAddrName", "shipping name", { wide: true })}
      {field("line1", "accountMemberAddrLine1", "shipping address-line1", { wide: true })}
      {field("line2", "accountMemberAddrLine2", "shipping address-line2", { wide: true, required: false })}
      {field("city", "accountMemberAddrCity", "shipping address-level2")}
      {field("state", "accountMemberAddrState", "shipping address-level1")}
      {field("postalCode", "accountMemberAddrPostal", "shipping postal-code")}
      <div className="fm-mbr-field">
        <label htmlFor={id("country")}>{c("accountMemberAddrCountry")}</label>
        <select id={id("country")} autoComplete="shipping country" value={form.country} onChange={(e) => set({ country: e.target.value })}>
          <option value="CA">{c("accountMemberCountryCA")}</option>
          <option value="US">{c("accountMemberCountryUS")}</option>
        </select>
      </div>
      <div className="fm-mbr-actions fm-mbr-wide">
        <button type="submit" className="fm-track-btn" disabled={!!busy} aria-busy={busy === "membershipAddress"}>{busy === "membershipAddress" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}{c("accountMemberSaveAddress")}</button>
        {m.address && <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={!!busy} onClick={() => onEdit(false)}>{c("accountMemberKeepAddress")}</button>}
      </div>
    </form>
  );
}
