import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useShopWords } from "./shopWords";
import { Checkbox, DataTable, DestructiveButton, EmptyState, PrimaryButton, SectionCard, SelectField, StatusBadge, TextField, useConfirm, type Column } from "./riso/components";
import { shopOwnerEmail } from "../lib/ownerDevice";
import { adminApi } from "./api";
import { type AdminRole, type TeamRole } from "./adminAccess";
import { hasStockroom } from "../../lib/shopProfile";
import { FAIR_TILL_PATH, combinedAdmin } from "./combined";
import { endOfToday, teamApi, teamEmail, teamMemberProblem, type TeamMember } from "./teamApi";

// Admin-only words (the Studio rule covers shopper-facing words).
// A website-only press has no stockroom: its words leave it out, and the stockroom-only Author role isn't offered.
const STOCKROOM = hasStockroom();
// Fair helpers ring up sales that the stockroom brings in, so only the plan with both apps offers the role.
const FAIR_HELPERS = combinedAdmin();
/** Where a fair helper opens their till: this admin's address, where they see only the Fair till. */
const fairTillAddress = (origin = typeof window === "undefined" ? "" : window.location.origin) => `${origin}${FAIR_TILL_PATH}`;
const ROLE_WORDS: Record<TeamRole, { label: string; detail: string; added: string }> = {
  staff: { label: "Staff", detail: "Can do everything in the admin except change the Team or the payment and email connections.", added: "can open the admin" },
  owner: { label: "Owner", detail: STOCKROOM ? "Everything, including the Team, the payment and email connections, and the stockroom." : "Everything, including the Team and the payment and email connections.", added: "can open the admin" },
  author: { label: "Author", detail: "Can't open this admin. In the stockroom, they see and update only the books that name them as the author.", added: "can open their books in the stockroom" },
  fairHelper: { label: "Fair helper", detail: `Gets only the Fair till: they ring up sales and see their own, and never see your money, settings, customers or other pages. Their sales join your records while your admin is open. Send them this address to open on their phone: ${fairTillAddress()}`, added: `can use the Fair till at ${fairTillAddress()}` },
  bookkeeper: { label: "Bookkeeper", detail: `Reads the orders, sales, tax collected, payouts and bookkeeping downloads${STOCKROOM ? ", and the stockroom's tax centre" : ""}. Can't change anything, and doesn't see books, settings, the customer list or the Team.`, added: "can read the shop's sales and tax" },
};

/** The role words in this shop's words ("Maker" and "products" in a shop that sells no books). */
function wordedRoles(w: (text: string) => string): Record<TeamRole, { label: string; detail: string; added: string }> {
  return Object.fromEntries(Object.entries(ROLE_WORDS).map(([role, r]) => [role, { label: w(r.label), detail: w(r.detail), added: w(r.added) }])) as Record<TeamRole, { label: string; detail: string; added: string }>;
}

/** "Until tonight" or "Until Nov 5", for a helper added for a set time. */
function untilWords(iso: string, now = new Date()): string {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return "";
  if (end.toDateString() === now.toDateString()) return "Until tonight";
  return `Until ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const TEAM_ABOUT = STOCKROOM ? "People who can open this admin or the stockroom." : "People who can open this admin.";

// Settings › Team. The owner adds people by their Google email; they sign in with that account.
export function TeamSettings() {
  const w = useShopWords();
  const roles = wordedRoles(w);
  const [ask, confirmNode] = useConfirm();
  const [myRole, setMyRole] = useState<AdminRole | null | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");
  // A friend minding the table for one fair: removed by itself tonight (functions/roles.js removeExpiredMembers).
  const [todayOnly, setTodayOnly] = useState(true);

  const load = () => teamApi.list().then(setMembers, () => setLoadError("Couldn't load the Team. Check your connection, then open this page again."));
  useEffect(() => {
    void adminApi.myRole().then(r => {
      setMyRole(r);
      if (r === "owner") void load();
    });
  }, []);

  if (myRole === undefined) return null;
  if (myRole !== "owner") {
    return (
      <SectionCard title="Team" description={TEAM_ABOUT}>
        <EmptyState inline title="Only the owner can change the Team" description="Ask the shop's owner to add, change or remove people." />
      </SectionCard>
    );
  }

  const problem = teamMemberProblem(email, role, members || []);
  const add = async () => {
    setTried(true);
    if (problem) return;
    setBusy("add");
    try {
      const ends = role === "fairHelper" && todayOnly;
      await teamApi.save(email, role, ends ? { until: endOfToday() } : {});
      toast.success(`${teamEmail(email)} ${roles[role].added} the next time they sign in${ends ? ", until tonight" : ""}.`);
      setEmail(""); setTried(false);
      await load();
    } catch {
      toast.error("Couldn't save. Nothing changed; try again in a moment.");
    } finally { setBusy(""); }
  };
  const remove = async (member: TeamMember) => {
    const message = member.role === "author"
      ? `${member.email} ${w("will be signed out. A book that still names them as its author stays open to them in the stockroom until you change that book's author.")}`
      : member.role === "fairHelper"
        ? `${member.email} will be signed out of the Fair till and can't open it again until you add them back. Sales they already sent stay in your records.`
        : `${member.email} will be signed out of the admin and can't open it again until you add them back.`;
    if (!await ask({ title: "Remove from the Team?", message, confirmLabel: "Remove" })) return;
    setBusy(member.email);
    try {
      await teamApi.remove(member.email);
      toast.success(`${member.email} was removed.`);
      await load();
    } catch {
      toast.error("Couldn't remove them. Nothing changed; try again in a moment.");
    } finally { setBusy(""); }
  };

  const columns: Column<TeamMember>[] = [
    { key: "email", header: "Email", lead: true, render: m => m.email },
    { key: "role", header: "Role", render: m => (
      <span className="inline-flex flex-wrap items-center gap-2">
        <StatusBadge tone={m.role === "owner" ? "info" : "neutral"} glyph={false}>{roles[m.role].label}</StatusBadge>
        {m.until && <span className="text-sm">{untilWords(m.until)}</span>}
      </span>
    ) },
    { key: "actions", header: "", render: m => m.email === shopOwnerEmail() ? null : (
      <DestructiveButton size="sm" disabled={!!busy} onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>{busy === m.email ? "Removing…" : "Remove"}</DestructiveButton>
    ) },
  ];
  const owner = shopOwnerEmail();
  const rows: TeamMember[] = [...(owner ? [{ email: owner, role: "owner" as const }] : []), ...(members || [])];

  return (
    <>
      <SectionCard title="Team" description={`${TEAM_ABOUT} Each person signs in with Google using the email you add here.`}>
        {loadError
          ? <EmptyState inline title="Team not loaded" description={loadError} />
          : <DataTable caption="Team" columns={columns} rows={members ? rows : []} rowKey={m => m.email} stackOnPhone
              empty={<EmptyState inline title="Loading the Team…" />} />}
      </SectionCard>
      <SectionCard title="Add someone" description={roles[role].detail}>
        <form className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={e => { e.preventDefault(); void add(); }}>
          <TextField label="Google email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
            error={tried ? problem || undefined : undefined} placeholder="name@example.com" />
          <SelectField label="Role" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
            <option value="staff">{roles.staff.label}</option>
            <option value="owner">{roles.owner.label}</option>
            {STOCKROOM && <option value="author">{roles.author.label}</option>}
            <option value="bookkeeper">{roles.bookkeeper.label}</option>
            {FAIR_HELPERS && <option value="fairHelper">{roles.fairHelper.label}</option>}
          </SelectField>
          <PrimaryButton type="submit" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add to Team"}</PrimaryButton>
          {role === "fairHelper" && (
            <div className="sm:col-span-3">
              <Checkbox label="Just for today: remove them automatically tonight" checked={todayOnly} onChange={e => setTodayOnly(e.target.checked)} />
            </div>
          )}
        </form>
      </SectionCard>
      {confirmNode}
    </>
  );
}
