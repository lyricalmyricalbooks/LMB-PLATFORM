import { restoredUser } from "../../lib/authSession";
import { functionFetch } from "./functionsBase";
import { rememberPractice } from "./practiceHint";

// Practice checkout on a private platform shop (plan 7.6): the owner's calls to the server (functions/practiceCheckout.js).

export type PracticeState = { active: boolean; until: string; refusal?: "own_keys" | "shop_open" | "owner_only" };

/**
 * Asks the server whether practice is on for the signed-in owner: "status", "start" or "stop". Without a sign-in the
 * answer is "off". The hint follows the answer.
 */
export async function practiceCheckout(step: "status" | "start" | "stop"): Promise<PracticeState> {
  const token = await (await restoredUser().catch(() => null))?.getIdToken();
  if (!token) {
    rememberPractice("");
    return { active: false, until: "" };
  }
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "practiceCheckout", step }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Couldn't reach the practice checkout.");
  const state: PracticeState = { active: result.active === true, until: typeof result.until === "string" ? result.until : "", ...(result.refusal ? { refusal: result.refusal } : {}) };
  rememberPractice(state.active ? state.until : "");
  return state;
}
