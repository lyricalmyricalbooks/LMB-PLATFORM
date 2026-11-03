// Books › Import › "From your old shop's address" (plan 23.11): asks the shop's own server (functions/oldShopRead.js)
// to read the old shop's public product list. Admin only; nothing is saved until the preview's Import.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { OldShopFile } from "./OldShopAddressForm";

export async function readOldShopAddress(address: string): Promise<OldShopFile> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "readOldShop", address }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data?.csv !== "string") throw new Error(data?.error || `The shop's server answered ${res.status}. Try again in a moment.`);
  return { host: String(data.host || "old shop"), csv: data.csv, notes: Array.isArray(data.notes) ? data.notes.map(String) : [] };
}
