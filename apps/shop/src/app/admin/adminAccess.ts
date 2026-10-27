// Who may open the admin, read the same way as the server (functions/roles.js): the owner address, or a role the
// server copied onto the sign-in pass from the owner's Team list (Settings › Team). The rules decide what each
// person can really read and write; this only decides whether the admin opens for them.
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";

export type AdminRole = "owner" | "staff";
export const ADMIN_ROLES: readonly AdminRole[] = ["owner", "staff"];

export function adminRoleOf(email: string | null | undefined, emailVerified: boolean, claims: Record<string, unknown> = {}): AdminRole | null {
  if (!emailVerified) return null;
  if (String(email || "").trim().toLowerCase() === SHOP_OWNER_EMAIL) return "owner";
  return ADMIN_ROLES.includes(claims.role as AdminRole) ? (claims.role as AdminRole) : null;
}

type SignedInUser = {
  email: string | null;
  emailVerified: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: Record<string, unknown> }>;
};

/** The signed-in person's admin role, from their current pass (no network when the pass is fresh). */
export async function currentAdminRole(user: (Partial<SignedInUser> & { email: string | null; emailVerified: boolean }) | null | undefined): Promise<AdminRole | null> {
  if (!user) return null;
  const result = await user.getIdTokenResult?.();
  return adminRoleOf(user.email, user.emailVerified, result?.claims);
}

/**
 * Asks the server to bring this person's pass up to date with the Team list (someone added before their first
 * sign-in has no role yet), then reads the role from a fresh pass. A failed refresh still reads the current pass.
 */
export async function refreshAdminRole(user: SignedInUser, refresh: (token: string) => Promise<unknown>): Promise<AdminRole | null> {
  try { await refresh(await user.getIdToken()); } catch { /* the pass as it is still decides */ }
  const { claims } = await user.getIdTokenResult(true);
  return adminRoleOf(user.email, user.emailVerified, claims);
}
