import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { UserPlus } from "lucide-react";
import { useShopWords } from "./shopWords";
import { ActionMenu, Checkbox, EmptyState, PageActions, PrimaryButton, SectionCard, SelectField, TextField, useConfirm, type MenuAction } from "./riso/components";
import { shopOwnerEmail } from "../lib/ownerDevice";
import { auth } from "../../lib/firebase";
import { adminApi } from "./api";
import { type AdminRole, type TeamRole } from "./adminAccess";
import { hasStockroom } from "../../lib/shopProfile";
import { combinedAdmin } from "./combined";
import { copyText } from "./clipboard";
import { endOfToday, selfDemotion, signInWords, teamApi, teamEmail, teamMemberProblem, type TeamMember } from "./teamApi";

// Admin-only words (the Studio rule covers shopper-facing words).
// A website-only press has no stockroom: its words leave it out, and the stockroom-only Author role isn't offered.
const STOCKROOM = hasStockroom();
// Fair helpers ring up sales that the stockroom brings in, so only the plan with both apps offers the role.
const FAIR_HELPERS = combinedAdmin();
type RoleWords = { label: string; detail: string };
// What each role can really do: the server and the rules hold them to it (functions/index.js requireOwner, firestore.rules).
const ROLE_WORDS: Record<TeamRole, RoleWords> = {
  staff: { label: "Staff", detail: "Orders, books, customers and the website. Not the Team, payments, Google, web addresses or apps." },
  owner: { label: "Co-owner", detail: "Everything you can do, including the Team and the payment and email connections." },
  author: { label: "Author", detail: "Can't open this admin. In the stockroom, they see and update only the books that name them as the author." },
  fairHelper: { label: "Fair helper", detail: "Only the Fair till: they ring up sales and see their own. Never your money, settings or customers." },
  bookkeeper: { label: "Bookkeeper", detail: `Reads orders, sales, tax and payouts${STOCKROOM ? ", and the stockroom's tax centre" : ""}. Changes nothing.` },
};

/** The role words in this shop's words ("Maker" and "products" in a shop that sells no books). */
function wordedRoles(w: (text: string) => string): Record<TeamRole, RoleWords> {
  return Object.fromEntries(Object.entries(ROLE_WORDS).map(([role, r]) => [role, { label: w(r.label), detail: w(r.detail) }])) as Record<TeamRole, RoleWords>;
}

/** "Until tonight" or "Until Nov 5", for a helper added for a set time. */
function untilWords(iso: string, now = new Date()): string {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return "";
  if (end.toDateString() === now.toDateString()) return "Until tonight";
  return `Until ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Two letters for a person's round face, from their name or the start of their email ("ada.lane@…" → "AL"). */
export function initialsOf(email: string, name = ""): string {
  const parts = (name.trim() ? name.trim().split(/\s+/) : email.split("@")[0].split(/[._\-+]+/)).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

/** The address an added person opens to sign in: the admin (Fair till and Bookkeeping open there too) or the stockroom. */
export function signInLink(member: Pick<TeamMember, "email" | "role">, origin = typeof window === "undefined" ? "" : window.location.origin): string {
  return member.role === "author" ? `${origin}/stockroom/app` : `${origin}/admin?invite=${encodeURIComponent(member.email)}`;
}

const ROLE_ORDER: TeamRole[] = ["staff", "owner", "bookkeeper", ...(STOCKROOM ? ["author" as const] : []), ...(FAIR_HELPERS ? ["fairHelper" as const] : [])];

// Settings › Team. Owners invite people by their Google email; each gets an email and signs in with that account.
export function TeamSettings() {
  const w = useShopWords();
  const roles = wordedRoles(w);
  const [ask, confirmNode] = useConfirm();
  const [myRole, setMyRole] = useState<AdminRole | null | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");
  // A friend minding the table for one fair: removed by itself tonight (functions/roles.js removeExpiredMembers).
  const [todayOnly, setTodayOnly] = useState(true);
  const emailBox = useRef<HTMLDivElement>(null);

  const load = () => teamApi.list().then(list => { setMembers(list); setLoadError(""); }, () => setLoadError("Couldn't load the Team. Check your connection, then try again."));
  useEffect(() => {
    void adminApi.myRole().then(r => {
      setMyRole(r);
      if (r === "owner") void load();
    });
  }, []);

  if (myRole === undefined) return null;
  if (myRole !== "owner") {
    return (
      <SectionCard title="Team">
        <EmptyState inline title="Only an owner can change the Team" description="Ask the shop's owner to add, change or remove people." />
      </SectionCard>
    );
  }

  const owner = shopOwnerEmail();
  const me = teamEmail(auth.currentUser?.email || "");
  const list = members || [];
  const problem = teamMemberProblem(email, role, list);

  const run = async (key: string, work: () => Promise<unknown>, done: string, failed = "Couldn't save. Nothing changed; try again in a moment.") => {
    setBusy(key);
    try {
      await work();
      toast.success(done);
      await load();
      return true;
    } catch {
      toast.error(failed);
      return false;
    } finally { setBusy(""); }
  };

  const add = async () => {
    setTried(true);
    if (problem) return;
    const id = teamEmail(email);
    if (role === "owner" && !await ask({ title: "Make them a co-owner?", message: `${id} will be able to do everything you can, including changing the Team and the payment and email connections.`, confirmLabel: "Invite as co-owner" })) return;
    const ends = role === "fairHelper" && todayOnly;
    const ok = await run("add", () => teamApi.add(id, role, { name, ...(ends ? { until: endOfToday() } : {}) }),
      `Invite sent to ${id}${ends ? ". They're on the Team until tonight" : ""}.`);
    if (ok) { setEmail(""); setName(""); setTried(false); }
  };

  const changeRole = async (m: TeamMember, next: TeamRole) => {
    if (next === m.role) return;
    const who = m.name || m.email;
    if (selfDemotion(m, next, me)) {
      if (!await ask({ title: "Give up owning the shop?", message: `You'll become ${roles[next].label.toLowerCase()} and can't change the Team any more. Only another owner can undo this.`, confirmLabel: `Make me ${roles[next].label.toLowerCase()}` })) return;
    } else if (next === "owner") {
      if (!await ask({ title: `Make ${who} a co-owner?`, message: "They'll be able to do everything you can, including changing the Team and the payment and email connections.", confirmLabel: "Make co-owner" })) return;
    }
    await run(m.email, () => teamApi.setRole(m.email, next), `${who} is now ${roles[next].label.toLowerCase()}. It applies the next time they open a page.`);
  };

  const remove = async (m: TeamMember) => {
    const who = m.name || m.email;
    const self = m.email === me;
    const message = self
      ? "You'll be signed out and can't open this shop again until an owner adds you back."
      : m.role === "author"
        ? `${who} ${w("will be signed out. A book that still names them as its author stays open to them in the stockroom until you change that book's author.")}`
        : m.role === "fairHelper"
          ? `${who} will be signed out of the Fair till. Sales they already sent stay in your records.`
          : `${who} will be signed out and can't open the shop again until you add them back.`;
    if (!await ask({ title: self ? "Leave the Team?" : `Remove ${who}?`, message, confirmLabel: self ? "Leave" : "Remove" })) return;
    await run(m.email, () => teamApi.remove(m.email), `${who} was removed from the Team.`, "Couldn't remove them. Nothing changed; try again in a moment.");
  };

  const menuFor = (m: TeamMember): MenuAction[] => [
    ...(!m.joinedAt ? [{ label: "Send invite again", onSelect: () => void run(m.email, () => teamApi.resendInvite(m.email), `Invite sent to ${m.email} again.`) }] : []),
    { label: "Copy sign-in link", onSelect: () => void copyText(signInLink(m), "Sign-in link") },
    { label: m.email === me ? "Leave the Team" : "Remove from the Team", tone: "danger" as const, onSelect: () => void remove(m) },
  ];

  const focusInvite = () => {
    emailBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    emailBox.current?.querySelector("input")?.focus({ preventScroll: true });
  };

  return (
    <>
      <PageActions><PrimaryButton icon={<UserPlus size={16} aria-hidden />} onClick={focusInvite}>Invite person</PrimaryButton></PageActions>
      <SectionCard title="People" description="Each person signs in with Google, using the email shown.">
        {loadError
          ? <EmptyState inline title="Team not loaded" description={loadError} action={<PrimaryButton size="sm" onClick={() => void load()}>Try again</PrimaryButton>} />
          : !members ? <EmptyState inline title="Loading the Team…" />
          : (
            <ul className="rp-team" aria-label="Team">
              {owner && (
                <li className="rp-team-row" data-holder>
                  <span className="rp-team-face" data-tone={0} aria-hidden="true">{initialsOf(owner)}</span>
                  <span className="rp-team-who">{owner}{owner === me && <em className="rp-team-you"> · you</em>}<small>Account holder · always owns the shop</small></span>
                  <span className="rp-team-role">Owner</span>
                </li>
              )}
              {list.map((m, i) => (
                <li key={m.email} className="rp-team-row" aria-busy={busy === m.email || undefined}>
                  <span className="rp-team-face" data-tone={(i + 1) % 4} aria-hidden="true">{initialsOf(m.email, m.name)}</span>
                  <span className="rp-team-who">
                    {m.name ? <>{m.name}<small className="rp-team-mail">{m.email}</small></> : m.email}
                    {m.email === me && <em className="rp-team-you"> · you</em>}
                    <small data-invited={!m.joinedAt || undefined}>{[signInWords(m), m.until ? untilWords(m.until) : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <select className="rp-team-pick" aria-label={`Role for ${m.name || m.email}`} value={m.role} disabled={!!busy}
                    onChange={e => void changeRole(m, e.target.value as TeamRole)}>
                    {(ROLE_ORDER.includes(m.role) ? ROLE_ORDER : [...ROLE_ORDER, m.role]).map(r => <option key={r} value={r}>{roles[r].label}</option>)}
                  </select>
                  <ActionMenu label={`More for ${m.name || m.email}`} actions={menuFor(m)} />
                </li>
              ))}
              {!list.length && (
                <li className="rp-team-row rp-team-empty"><span className="rp-team-who">Just you so far.<small>Invite staff, a bookkeeper or a co-owner below.</small></span></li>
              )}
            </ul>
          )}
      </SectionCard>
      <SectionCard title="Invite someone" description="They get an email with a link and sign in with Google.">
        <form className="rp-team-invite" onSubmit={e => { e.preventDefault(); void add(); }} noValidate>
          <div ref={emailBox} className="rp-team-invite-email">
            <TextField label="Google email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
              error={tried ? problem || undefined : undefined} placeholder="name@example.com" />
          </div>
          <TextField label="Name" hint="Optional" autoComplete="off" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          <SelectField label="Role" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
            {ROLE_ORDER.map(r => <option key={r} value={r}>{roles[r].label}</option>)}
          </SelectField>
          <p className="rp-hint rp-team-role-detail" aria-live="polite">{roles[role].detail}</p>
          {role === "fairHelper" && (
            <Checkbox label="Just for today: remove them automatically tonight" checked={todayOnly} onChange={e => setTodayOnly(e.target.checked)} />
          )}
          <div><PrimaryButton type="submit" busy={busy === "add"}>Send invite</PrimaryButton></div>
        </form>
      </SectionCard>
      {confirmNode}
    </>
  );
}
