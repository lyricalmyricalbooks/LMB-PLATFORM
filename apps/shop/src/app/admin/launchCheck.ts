// The last check before shoppers are let in, wherever the shop is opened from (code plan 17.13). The setup guide and
// the final check already run it; the top bar's shop status menu and Settings › General › Store status open the shop
// through the same switch (Dashboard's toggleUnderConstruction), so it runs there too. Reads only.
import { adminApi } from "./api";
import { getOrdersCached } from "./ordersCache";
import { launchReadiness, type ReadinessItem } from "./launchReadiness";
import { openBlockers } from "./firstWeek";
import { platformCardsProvider } from "../../lib/shopProfile";
import { auth } from "../../lib/firebase";
import { appsSetUp, backupApiFor, firebaseTwoStep } from "./adminTwoStep";

/**
 * The signed-in person's sign-in for Ready to sell: two-step on, and backup codes left (null when they couldn't be
 * counted). Null when nobody is signed in or it couldn't be read; it never fails the other checks.
 */
export async function readSignIn(user = auth.currentUser): Promise<{ twoStep: boolean; codesLeft: number | null } | null> {
  if (!user) return null;
  try {
    const twoStep = appsSetUp(firebaseTwoStep(auth), user).length > 0;
    const codesLeft = twoStep ? await backupApiFor(user).status().then(s => s.left, () => null) : null;
    return { twoStep, codesLeft };
  } catch { return null; }
}

/** Everything Ready to sell reads, read fresh, worked into its checks. Throws when any part can't be read. */
export async function readLaunchReadiness(api: typeof adminApi = adminApi, orders: () => Promise<any[]> = () => getOrdersCached(), signInNow: () => Promise<{ twoStep: boolean; codesLeft: number | null } | null> = readSignIn): Promise<ReadinessItem[]> {
  const [settings, shippingProfiles, emailLog, platformAccount, books, allOrders, signIn] = await Promise.all([
    api.getSettings(),
    api.getShippingProfiles(),
    api.getRecentEmailLog(5),
    platformCardsProvider() ? api.platformPayments("status").catch(() => null) : Promise.resolve(undefined),
    api.getAllBooks(),
    orders(),
    signInNow(),
  ]);
  return launchReadiness({ settings, shippingProfiles, emailLog, platformAccount, books, orders: allOrders, signIn });
}

/** What the press reads when something would stop a sale: the first few things, in plain words. */
export function blockedMessage(blockers: ReadinessItem[]): string {
  const shown = blockers.slice(0, 3).map(b => b.label);
  const more = blockers.length > shown.length ? ` and ${blockers.length - shown.length} more` : "";
  return `Shoppers couldn't buy yet. Still to do: ${shown.join("; ")}${more}. Home's Ready to sell list takes you to each one.`;
}

/**
 * Whether the shop may open now: the blockers when it may not (empty when it may), or null when the checks couldn't be
 * read (offline, say), in which case the caller asks as before rather than lock the press out.
 */
export async function blockersBeforeOpening(read: () => Promise<ReadinessItem[]> = readLaunchReadiness): Promise<ReadinessItem[] | null> {
  try { return openBlockers(await read()); } catch { return null; }
}

/** The top bar's button while the shop is private (design handoff "Colophon platform"): how many steps are left, if known. */
export function openButtonLabel(stepsLeft: number | null): string {
  if (!stepsLeft) return "Open to shoppers";
  return `Open to shoppers · ${stepsLeft} ${stepsLeft === 1 ? "step" : "steps"}`;
}
