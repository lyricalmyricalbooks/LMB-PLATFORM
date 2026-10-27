import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, DestructiveButton, EmptyState, PrimaryButton, SectionCard, SelectField, StatusBadge, TextField, useConfirm, type Column } from "./riso/components";
import { auth } from "../../lib/firebase";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";
import { currentAdminRole, type AdminRole } from "./adminAccess";
import { teamApi, teamEmail, teamMemberProblem, type TeamMember } from "./teamApi";

const ROLE_WORDS: Record<AdminRole, { label: string; detail: string }> = {
  staff: { label: "Staff", detail: "Can do everything in the admin except change the Team or the payment and email keys." },
  owner: { label: "Owner", detail: "Everything, including the Team and the payment and email keys." },
};

// Settings › Team. The owner adds people by their Google email; they sign in to the admin with that account.
export function TeamSettings() {
  const [ask, confirmNode] = useConfirm();
  const [myRole, setMyRole] = useState<AdminRole | null | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("staff");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");

  const load = () => teamApi.list().then(setMembers, () => setLoadError("Couldn't load the Team. Check your connection, then open this page again."));
  useEffect(() => {
    void currentAdminRole(auth.currentUser).then(r => {
      setMyRole(r);
      if (r === "owner") void load();
    });
  }, []);

  if (myRole === undefined) return null;
  if (myRole !== "owner") {
    return (
      <SectionCard title="Team" description="People who can open this admin.">
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
      toast.success(`${teamEmail(email)} can open the admin the next time they sign in.`);
      setEmail(""); setTried(false);
      await load();
    } catch {
      toast.error("Couldn't save. Nothing changed; try again in a moment.");
    } finally { setBusy(""); }
  };
  const remove = async (member: TeamMember) => {
    if (!await ask({ title: "Remove from the Team?", message: `${member.email} will be signed out of the admin and can't open it again until you add them back.`, confirmLabel: "Remove" })) return;
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
    { key: "actions", header: "", render: m => m.email === SHOP_OWNER_EMAIL ? null : (
      <DestructiveButton size="sm" disabled={!!busy} onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>{busy === m.email ? "Removing…" : "Remove"}</DestructiveButton>
    ) },
  ];
  const rows: TeamMember[] = [{ email: SHOP_OWNER_EMAIL, role: "owner" }, ...(members || [])];

  return (
    <>
      <SectionCard title="Team" description="People who can open this admin. Each person signs in with Google using the email you add here.">
        {loadError
          ? <EmptyState inline title="Team not loaded" description={loadError} />
          : <DataTable caption="Team" columns={columns} rows={members ? rows : []} rowKey={m => m.email} stackOnPhone
              empty={<EmptyState inline title="Loading the Team…" />} />}
      </SectionCard>
      <SectionCard title="Add someone" description={ROLE_WORDS[role].detail}>
        <form className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={e => { e.preventDefault(); void add(); }}>
          <TextField label="Google email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
            error={tried ? problem || undefined : undefined} placeholder="name@example.com" />
          <SelectField label="Role" value={role} onChange={e => setRole(e.target.value as AdminRole)}>
            <option value="staff">{ROLE_WORDS.staff.label}</option>
            <option value="owner">{ROLE_WORDS.owner.label}</option>
          </SelectField>
          <PrimaryButton type="submit" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add to Team"}</PrimaryButton>
        </form>
      </SectionCard>
      {confirmNode}
    </>
  );
}
