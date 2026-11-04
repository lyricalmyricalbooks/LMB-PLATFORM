// Settings › Apps (platform plan 26.5): what installed apps changed in this shop. Each change an app asks for is an
// `appRequests/<id>` document, written by the platform and answered by the shop's own checks
// (functions/appRequests.js); admins can read them (firestore.rules), nobody can write them from the browser.
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";

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
    const item = `${input.productId ?? ""}${input.variantId ? ` (${input.variantId})` : ""}`;
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
