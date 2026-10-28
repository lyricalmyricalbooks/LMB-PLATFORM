// Who may open the admin, read the same way as the server (functions/roles.js): the owner address, or a role the
// server copied onto the sign-in pass from the owner's Team list (Settings › Team). The rules decide what each
// person can really read and write; this only decides whether the admin opens for them.
// The owner address isn't built into the page (lib/ownerDevice.ts): the server tells the admin after sign-in.
import { isShopOwner, rememberShopOwner, shopOwnerEmail } from "../lib/ownerDevice";
import { supportOf } from "./supportSession";

export type AdminRole = "owner" | "staff";
export const ADMIN_ROLES: readonly AdminRole[] = ["owner", "staff"];
// Every role the Team can give. "author" is for the stockroom only and never opens this admin (adminRoleOf ignores it).
export type TeamRole = AdminRole | "author";
export const TEAM_ROLES: readonly TeamRole[] = ["owner", "staff", "author"];

export function adminRoleOf(email: string | null | undefined, emailVerified: boolean, claims: Record<string, unknown> = {}): AdminRole | null {
  // Platform support (supportSession.ts) is staff while its visit lasts, with no email of its own.
  if (supportOf(claims)) return "staff";
  if (!emailVerified) return null;
  if (isShopOwner(email)) return "owner";
  return ADMIN_ROLES.includes(claims.role as AdminRole) ? (claims.role as AdminRole) : null;
}

type SignedInUser = {
  email: string | null;
  emailVerified: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: Record<string, unknown> }>;
};
type Refresh = (token: string) => Promise<unknown>;

/** The server's answer ({ role, ownerEmail? }) from a fetch Response or a plain object; null when unreadable. */
async function answerOf(result: unknown): Promise<Record<string, unknown> | null> {
  try {
    const value = result && typeof (result as Response).json === "function" ? await (result as Response).json() : result;
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Asks the server to bring this person's pass up to date with the Team list (someone added before their first
 * sign-in has no role yet), learns the owner's address from its answer, then reads the role from a fresh pass.
 * A failed refresh still reads the current pass.
 */
export async function refreshAdminRole(user: SignedInUser, refresh: Refresh): Promise<AdminRole | null> {
  try {
    const answer = await answerOf(await refresh(await user.getIdToken()));
    if (answer?.ownerEmail) rememberShopOwner(answer.ownerEmail, user.email);
  } catch { /* the pass as it is still decides */ }
  const { claims } = await user.getIdTokenResult(true);
  return adminRoleOf(user.email, user.emailVerified, claims);
}

// One refresh per page for a session that was restored (no sign-in popup), so the owner's address is known.
let restoredRefresh: Promise<unknown> | null = null;

/** Learns the owner's address once per page when it isn't known yet. Never throws. */
export function ensureShopOwnerKnown(user: SignedInUser | null | undefined, refresh: Refresh): Promise<unknown> {
  if (!user || shopOwnerEmail()) return Promise.resolve();
  restoredRefresh ||= refreshAdminRole(user, refresh).catch(() => null);
  return restoredRefresh;
}

/**
 * The signed-in person's admin role, from their current pass (no network when the pass is fresh). With `refresh`,
 * an owner whose address the page doesn't know yet is recognised after one call to the server.
 */
export async function currentAdminRole(user: (Partial<SignedInUser> & { email: string | null; emailVerified: boolean }) | null | undefined, refresh?: Refresh): Promise<AdminRole | null> {
  if (!user) return null;
  if (refresh && user.getIdToken && user.getIdTokenResult) await ensureShopOwnerKnown(user as SignedInUser, refresh);
  const result = await user.getIdTokenResult?.();
  return adminRoleOf(user.email, user.emailVerified, result?.claims);
}
