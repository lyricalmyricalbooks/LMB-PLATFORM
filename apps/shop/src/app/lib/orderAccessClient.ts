import { restoredUser } from "../../lib/authSession";

const memoryKeys = new Map<string, string>();
const storageKey = (id: string) => `order-access:${id}`;
/** This tab's last unpaid checkout attempt (sessionStorage; Checkout sends it with a retry as `previousOrderId`). */
export const CHECKOUT_ATTEMPT_KEY = "fm_last_checkout_order";
export function newOrderAccessKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function rememberOrderAccess(id: string, key: string): void {
  memoryKeys.set(id, key);
  try { sessionStorage.setItem(storageKey(id), key); } catch { /* The receipt email remains the recovery path. */ }
}
export function savedOrderAccess(id: string): string {
  try { return sessionStorage.getItem(storageKey(id)) || memoryKeys.get(id) || ""; } catch { return memoryKeys.get(id) || ""; }
}
export async function orderAccessHeaders(id: string, key?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await (await restoredUser().catch(() => null))?.getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const access = key || savedOrderAccess(id);
  if (access) headers["X-Order-Key"] = access;
  return headers;
}
