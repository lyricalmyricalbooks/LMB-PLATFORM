// Asks the shop's own server (functions/oldShopRead.js) to read an old shop's public pages. Admin only; nothing is saved.
//   Books › Import › "From your old shop's address" (plan 23.11): its product list, as a product file.
//   Settings › General › URL redirects › Check your old links (plan 23.8): its page addresses, from its site map,
//   and Bring pages over (plan 23.6): its own pages, rebuilt safely, to save as drafts.
//   Orders › Bring past orders over (plan 23.7): saves past orders as history only; takes a run back (23.15); suggests
//   a rate for other currencies (23.14).
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { OldShopFile } from "./OldShopAddressForm";
import type { OldPage } from "./oldLinks";

async function ask(action: string, body: Record<string, unknown>): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `The shop's server answered ${res.status}. Try again in a moment.`);
  return data;
}

const notesOf = (data: any): string[] => (Array.isArray(data?.notes) ? data.notes.map(String) : []);

export async function readOldShopAddress(address: string): Promise<OldShopFile> {
  const data = await ask("readOldShop", { address });
  if (typeof data?.csv !== "string") throw new Error("The shop's server answered without a product list. Try again in a moment.");
  return { host: String(data.host || "old shop"), csv: data.csv, notes: notesOf(data) };
}

export interface OldLinksAnswer { host: string; paths: string[]; notes: string[] }

export async function readOldLinks(address: string): Promise<OldLinksAnswer> {
  const data = await ask("readOldLinks", { address });
  if (!Array.isArray(data?.paths)) throw new Error("The shop's server answered without a list of pages. Try again in a moment.");
  return { host: String(data.host || "old shop"), paths: data.paths.map(String), notes: notesOf(data) };
}

export interface OldPagesAnswer { host: string; pages: OldPage[]; skipped: { path: string; reason: string }[] }

/** Settings › General › URL redirects › Bring pages over (plan 23.6): the old shop's own pages at `paths`, rebuilt safely. */
export async function readOldPages(address: string, paths: string[]): Promise<OldPagesAnswer> {
  const data = await ask("readOldPages", { address, paths });
  if (!Array.isArray(data?.pages)) throw new Error("The shop's server answered without any pages. Try again in a moment.");
  return { host: String(data.host || "old shop"), pages: data.pages, skipped: Array.isArray(data.skipped) ? data.skipped : [] };
}

/**
 * Orders › Bring past orders over (plan 23.7): one batch of past orders, saved by the server as history only. `batch`
 * names the whole run, so it can be taken back at once (plan 23.15).
 */
export async function importPastOrders(orders: unknown[], batch?: string): Promise<{ added: number; skipped: { oldRef: string; reason: string }[] }> {
  const data = await ask("importPastOrders", { orders, ...(batch ? { batch } : {}) });
  return { added: Number(data?.added) || 0, skipped: Array.isArray(data?.skipped) ? data.skipped : [] };
}

/** Takes one run of Bring past orders over back (plan 23.15): asks until every order it added is gone. */
export async function removePastOrders(batch: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 50; round += 1) {
    const data = await ask("removePastOrders", { batch });
    removed += Number(data?.removed) || 0;
    if (!data?.more) break;
  }
  return removed;
}

/** The Bank of Canada's average rate for each currency over these dates (plan 23.14), as a suggestion. */
export async function suggestedRates(currencies: string[], from: string, to: string): Promise<Record<string, number>> {
  const data = await ask("exchangeRates", { currencies, from, to });
  const rates: Record<string, number> = {};
  for (const [c, r] of Object.entries(data?.rates || {})) if (typeof r === "number" && r > 0) rates[c] = r;
  return rates;
}
