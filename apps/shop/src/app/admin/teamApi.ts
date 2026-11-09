import { Timestamp, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { shopOwnerEmail } from "../lib/ownerDevice";
import { TEAM_ROLES, type TeamRole } from "./adminAccess";

// Settings › Team: members/{email}, written only by the owner (firestore.rules). The server copies each role onto
// that person's sign-in pass (functions/roles.js syncMemberRole), so a change takes effect at their next page load.

// `until`: a fair helper added for today only (ISO time); the server removes them after it (functions/roles.js).
export type TeamMember = { email: string; role: TeamRole; until?: string };

/** The end of the day `now` falls on, in this device's time: when a "for today only" helper is removed. */
export function endOfToday(now = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return end;
}

export const teamEmail = (value: string) => value.trim().toLowerCase();

/** Same checks as the rules and the server (functions/roles.js memberProblem). */
export function teamMemberProblem(email: string, role: string, members: TeamMember[] = []): string | null {
  const id = teamEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || id.length > 254) return "Enter the person's email address.";
  if (id === shopOwnerEmail()) return "That's the owner's address, which always has access.";
  if (!TEAM_ROLES.includes(role as TeamRole)) return "Choose a role.";
  if (members.some(m => m.email === id && m.role === role)) return "That person already has this role.";
  return null;
}

export const teamApi = {
  list: async (): Promise<TeamMember[]> => {
    const snap = await getDocs(collection(db, "members"));
    return snap.docs
      .map(d => {
        const until = d.data().until;
        return { email: d.id, role: d.data().role as TeamRole, ...(until?.toDate ? { until: until.toDate().toISOString() } : {}) };
      })
      .filter(m => TEAM_ROLES.includes(m.role))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  save: (email: string, role: TeamRole, { until }: { until?: Date } = {}) =>
    setDoc(doc(db, "members", teamEmail(email)), {
      role, addedAt: serverTimestamp(), addedBy: auth.currentUser?.email || "",
      // Only a fair helper may end (firestore.rules members).
      ...(until && role === "fairHelper" ? { until: Timestamp.fromDate(until) } : {}),
    }),
  remove: (email: string) => deleteDoc(doc(db, "members", teamEmail(email))),
};
