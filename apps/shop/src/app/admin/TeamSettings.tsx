import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, DestructiveButton, EmptyState, PrimaryButton, SectionCard, SelectField, StatusBadge, TextField, useConfirm, type Column } from "./riso/components";
import { shopOwnerEmail } from "../lib/ownerDevice";
import { adminApi } from "./api";
import { type AdminRole, type TeamRole } from "./adminAccess";
import { teamApi, teamEmail, teamMemberProblem, type TeamMember } from "./teamApi";

// Admin-only words (the Studio rule covers shopper-facing words).
const ROLE_WORDS: Record<TeamRole, { label: string; detail: string; added: string }> = {
  staff: { label: "Staff", detail: "Can do everything in the admin except change the Team or the payment and email connections.", added: "can open the admin" },
  owner: { label: "Owner", detail: "Everything, including the Team, the payment and email connections, and the stockroom.", added: "can open the admin" },
  author: { label: "Author", detail: "Can't open this admin. In the stockroom, they see and update only the books that name them as the author.", added: "can open their books in the stockroom" },
  bookkeeper: { label: "Bookkeeper", detail: "Reads the orders, sales, tax collected, payouts and bookkeeping downloads, and the stockroom's tax centre. Can't change anything, and doesn't see books, settings, the customer list or the Team.", added: "can read the shop's sales and tax" },
};

// Settings › Team. The owner adds people by their Google email; they sign in with that account.
export function TeamSettings() {
  const [ask, confirmNode] = useConfirm();
  const [myRole, setMyRole] = useState<AdminRole | null | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");

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
      <SectionCard title="Team" description="People who can open this admin or the stockroom.">
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
      await teamApi.save(email, role);
      toast.success(`${teamEmail(email)} ${ROLE_WORDS[role].added} the next time they sign in.`);
      setEmail(""); setTried(false);
      await load();
    } catch {
      toast.error("Couldn't save. Nothing changed; try again in a moment.");
    } finally { setBusy(""); }
  };
  const remove = async (member: TeamMember) => {
    const message = member.role === "author"
      ? `${member.email} will be signed out. A book that still names them as its author stays open to them in the stockroom until you change that book's author.`
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
    { key: "role", header: "Role", render: m => <StatusBadge tone={m.role === "owner" ? "info" : "neutral"} glyph={false}>{ROLE_WORDS[m.role].label}</StatusBadge> },
    { key: "actions", header: "", render: m => m.email === shopOwnerEmail() ? null : (
      <DestructiveButton size="sm" disabled={!!busy} onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>{busy === m.email ? "Removing…" : "Remove"}</DestructiveButton>
    ) },
  ];
  const owner = shopOwnerEmail();
  const rows: TeamMember[] = [...(owner ? [{ email: owner, role: "owner" as const }] : []), ...(members || [])];

  return (
    <>
      <SectionCard title="Team" description="People who can open this admin or the stockroom. Each person signs in with Google using the email you add here.">
        {loadError
          ? <EmptyState inline title="Team not loaded" description={loadError} />
          : <DataTable caption="Team" columns={columns} rows={members ? rows : []} rowKey={m => m.email} stackOnPhone
              empty={<EmptyState inline title="Loading the Team…" />} />}
      </SectionCard>
      <SectionCard title="Add someone" description={ROLE_WORDS[role].detail}>
        <form className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={e => { e.preventDefault(); void add(); }}>
          <TextField label="Google email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
            error={tried ? problem || undefined : undefined} placeholder="name@example.com" />
          <SelectField label="Role" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
            <option value="staff">{ROLE_WORDS.staff.label}</option>
            <option value="owner">{ROLE_WORDS.owner.label}</option>
            <option value="author">{ROLE_WORDS.author.label}</option>
            <option value="bookkeeper">{ROLE_WORDS.bookkeeper.label}</option>
          </SelectField>
          <PrimaryButton type="submit" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add to Team"}</PrimaryButton>
        </form>
      </SectionCard>
      {confirmNode}
    </>
  );
}
