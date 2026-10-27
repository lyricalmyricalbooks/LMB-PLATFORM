import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";
import { ADMIN_ROLES, type AdminRole } from "./adminAccess";

// Settings › Team: members/{email}, written only by the owner (firestore.rules). The server copies each role onto
// that person's sign-in pass (functions/roles.js syncMemberRole), so a change takes effect at their next page load.

export type TeamMember = { email: string; role: AdminRole };

export const teamEmail = (value: string) => value.trim().toLowerCase();

/** Same checks as the rules and the server (functions/roles.js memberProblem). */
export function teamMemberProblem(email: string, role: string, members: TeamMember[] = []): string | null {
  const id = teamEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || id.length > 254) return "Enter the person's email address.";
  if (id === SHOP_OWNER_EMAIL) return "That's the owner's address, which always has access.";
  if (!ADMIN_ROLES.includes(role as AdminRole)) return "Choose a role.";
  if (members.some(m => m.email === id && m.role === role)) return "That person already has this role.";
  return null;
}

export const teamApi = {
  list: async (): Promise<TeamMember[]> => {
    const snap = await getDocs(collection(db, "members"));
    return snap.docs
      .map(d => ({ email: d.id, role: d.data().role as AdminRole }))
      .filter(m => ADMIN_ROLES.includes(m.role))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  save: (email: string, role: AdminRole) =>
    setDoc(doc(db, "members", teamEmail(email)), { role, addedAt: serverTimestamp(), addedBy: auth.currentUser?.email || "" }),
  remove: (email: string) => deleteDoc(doc(db, "members", teamEmail(email))),
};
