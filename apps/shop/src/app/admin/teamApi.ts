import { Timestamp, collection, deleteDoc, deleteField, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { shopOwnerEmail } from "../lib/ownerDevice";
import { TEAM_ROLES, type TeamRole } from "./adminAccess";

// Settings › Team: members/{email}, written only by owners (firestore.rules). The server copies each role onto
// that person's sign-in pass (functions/roles.js syncMemberRole), so a change takes effect at their next page load,
// emails a new person their invitation (functions/teamInvite.js) and stamps lastSignInAt when they sign in.

// `until`: a fair helper added for today only (ISO time); the server removes them after it (functions/roles.js).
// `lastSignInAt` / `joinedAt`: ISO times the server wrote; no `joinedAt` means they haven't signed in yet.
export type TeamMember = { email: string; role: TeamRole; until?: string; name?: string; lastSignInAt?: string; joinedAt?: string; addedBy?: string };

/** The end of the day `now` falls on, in this device's time: when a "for today only" helper is removed. */
export function endOfToday(now = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return end;
}

export const teamEmail = (value: string) => value.trim().toLowerCase();
export const teamName = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 80);

/** Same checks as the rules and the server (functions/roles.js memberProblem). */
export function teamMemberProblem(email: string, role: string, members: TeamMember[] = []): string | null {
  const id = teamEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || id.length > 254) return "Enter the person's email address.";
  if (id === shopOwnerEmail()) return "That's the owner's address, which always has access.";
  if (!TEAM_ROLES.includes(role as TeamRole)) return "Choose a role.";
  if (members.some(m => m.email === id)) return "Already on the Team. Change their role in the list above.";
  return null;
}

/**
 * Why this role change can't go ahead, or null. The account holder never changes here (they always own the shop);
 * an owner moving themselves down is allowed, but the page asks first (`selfDemotion`).
 */
export function roleChangeProblem(member: TeamMember, role: string): string | null {
  if (member.email === shopOwnerEmail()) return "The account holder always owns the shop.";
  if (!TEAM_ROLES.includes(role as TeamRole)) return "Choose a role.";
  return null;
}

/** True when the signed-in owner would take away their own power to manage the Team. */
export const selfDemotion = (member: TeamMember, role: string, me = auth.currentUser?.email || "") =>
  member.email === teamEmail(me) && member.role === "owner" && role !== "owner";

/** "Invited" until the server saw a first sign-in, then "Signed in Nov 5" (today: "Signed in today"). */
export function signInWords(member: Pick<TeamMember, "joinedAt" | "lastSignInAt">, now = new Date()): string {
  const at = member.lastSignInAt || member.joinedAt;
  if (!at) return "Invited · hasn't signed in yet";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "Signed in";
  if (when.toDateString() === now.toDateString()) return "Signed in today";
  const sameYear = when.getFullYear() === now.getFullYear();
  return `Signed in ${when.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}`;
}

const iso = (v: unknown) => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : undefined);

export const teamApi = {
  list: async (): Promise<TeamMember[]> => {
    const owner = shopOwnerEmail();
    const snap = await getDocs(collection(db, "members"));
    return snap.docs
      .map(d => {
        const data = d.data();
        const member: TeamMember = { email: d.id, role: data.role as TeamRole };
        if (typeof data.name === "string" && data.name.trim()) member.name = data.name.trim();
        if (typeof data.addedBy === "string" && data.addedBy) member.addedBy = data.addedBy;
        for (const key of ["until", "lastSignInAt", "joinedAt"] as const) {
          const value = iso(data[key]);
          if (value) member[key] = value;
        }
        return member;
      })
      // The account holder's own entry (written at sign-up) is shown once, as the page's first row.
      .filter(m => TEAM_ROLES.includes(m.role) && m.email !== owner)
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  /** Adds someone new; the server then emails their invitation. */
  add: (email: string, role: TeamRole, { until, name }: { until?: Date; name?: string } = {}) =>
    setDoc(doc(db, "members", teamEmail(email)), {
      role, addedAt: serverTimestamp(), addedBy: auth.currentUser?.email || "",
      ...(name && teamName(name) ? { name: teamName(name) } : {}),
      // Only a fair helper may end (firestore.rules members).
      ...(until && role === "fairHelper" ? { until: Timestamp.fromDate(until) } : {}),
    }),
  /** A new role for someone already on the Team. Moving off fair helper drops the "today only" end. */
  setRole: (email: string, role: TeamRole) =>
    updateDoc(doc(db, "members", teamEmail(email)), role === "fairHelper" ? { role } : { role, until: deleteField() }),
  /** Emails the invitation again (functions/teamInvite.js teamChange: a new inviteRequestedAt). */
  resendInvite: (email: string) => updateDoc(doc(db, "members", teamEmail(email)), { inviteRequestedAt: serverTimestamp() }),
  remove: (email: string) => deleteDoc(doc(db, "members", teamEmail(email))),
};
