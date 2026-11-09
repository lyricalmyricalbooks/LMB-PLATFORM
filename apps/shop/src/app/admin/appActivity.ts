// Settings › Apps (platform plan 26.5): what installed apps changed in this shop. Each change an app asks for is an
// `appRequests/<id>` document, written by the platform and answered by the shop's own checks
// (functions/appRequests.js); admins can read them (firestore.rules), nobody can write them from the browser.
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";

export type AppRequestDoc = {
  op?: string; appName?: string; appId?: string; createdAt?: string; answeredAt?: string;
  status?: "done" | "refused"; reason?: string; result?: unknown;
  input?: { orderId?: string; trackingCarrier?: string; trackingNumber?: string; shipped?: boolean; productId?: string; variantId?: string; change?: number };
};
export type ActivityRow = { id: string; app: string; what: string; when: string; state: "done" | "refused" | "waiting"; reason: string };

export const ACTIVITY_LIMIT = 50;

/** One request in plain words. */
export function activityRow(id: string, doc: AppRequestDoc): ActivityRow {
  const input = doc.input ?? {};
  let what = "Asked for a change the shop doesn't know";
  if (doc.op === "order.dispatch") {
    what = input.shipped === false
      ? `Added tracking to order ${input.orderId ?? ""}`
      : `Marked order ${input.orderId ?? ""} sent (${input.trackingCarrier ?? ""} ${input.trackingNumber ?? ""})`;
  } else if (doc.op === "inventory.adjust") {
    const n = Number(input.change) || 0;
    const title = (doc.result as { title?: string } | null)?.title;
    const item = `${title || input.productId || ""}${input.variantId ? ` (${input.variantId})` : ""}`;
    what = `${n > 0 ? "Added" : "Took away"} ${Math.abs(n)} of ${item}`;
  }
  return {
    id, app: doc.appName || doc.appId || "An app", what: what.replace(/\s+/g, " ").trim(), when: doc.createdAt ?? "",
    state: doc.status === "done" || doc.status === "refused" ? doc.status : "waiting",
    reason: doc.status === "refused" ? doc.reason ?? "" : "",
  };
}

export const appActivityApi = {
  async recent(): Promise<ActivityRow[]> {
    const snap = await getDocs(query(collection(db, "appRequests"), orderBy("createdAt", "desc"), limit(ACTIVITY_LIMIT)));
    return snap.docs.map((d) => activityRow(d.id, d.data() as AppRequestDoc));
  },
};

// ── The store and the installed apps, through the platform's app store door (functions/appsLink.js) ──

export type AppPermission = { scope: string; words: string; personal: boolean };
export type InstalledApp = { appId: string; name: string; tagline: string; category: string; permissions: AppPermission[]; installedAt?: string; supportEmail: string; website: string; testing?: boolean };
export type StoreApp = { appId: string; name: string; tagline: string; description: string; category: string; categoryName: string; permissions: AppPermission[]; supportEmail: string; website: string; installAddress: string };
export type StoreAnswer = { apps: StoreApp[]; categories: Array<{ id: string; name: string }> };

/** Where Add sends the press: the app's own start address with this shop, as the big platforms do. */
export function addAddress(app: Pick<StoreApp, "installAddress" | "website">, shopId: string): string {
  if (!app.installAddress) return app.website;
  const url = new URL(app.installAddress);
  url.searchParams.set("shop", shopId);
  return url.href;
}

async function door(payload: Record<string, unknown>): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "apps", ...payload }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "Couldn't reach the app store just now."), { code: data?.code });
  return data;
}

export const appsApi = {
  installed: async (): Promise<InstalledApp[]> => (await door({ step: "installed" })).apps ?? [],
  store: async (): Promise<StoreAnswer> => { const d = await door({ step: "store" }); return { apps: d.apps ?? [], categories: d.categories ?? [] }; },
  remove: async (appId: string): Promise<void> => { await door({ step: "remove", appId }); },
  activity: () => appActivityApi.recent(),
};
export type AppsApi = typeof appsApi;
