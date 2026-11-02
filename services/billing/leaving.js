// Why presses leave (code plan 19.8). When a press cancels its plan, the Plan & billing page asks one optional
// question: why? One of a few reasons, plus a few words of their own if they like. The answer is kept on the billing row
// as `leaving: { reason, words, at }` (and `keptAt` if they keep their plan after all) and in the cancel's log entry;
// the control room counts the answers (control-room/leaving.js). Cancelling with no answer works the same.
//
// The press's words are plain text, kept as written (trimmed, at most 500 characters), and are shown only to the
// platform's admins.
import { BillingError } from "./billing.js";

/** The reasons a press can pick, in the order the page shows them, with the words the control room uses for each. */
export const LEAVING_REASONS = Object.freeze({
  price: "The price",
  "missing-feature": "Something missing",
  "closed-press": "The press is closing",
  moving: "Moving to something else",
  other: "Something else",
});
export const LEAVING_WORDS_MAX = 500;

/**
 * The press's answer, checked: null when they gave none; else { reason, words, at }. A reason that isn't one of
 * LEAVING_REASONS is refused in plain words (400), before anything is cancelled. Words alone, with no reason, count as
 * "other".
 */
export function leavingAnswer({ reason, words, at }) {
  const text = typeof words === "string" ? words.trim().slice(0, LEAVING_WORDS_MAX) : "";
  if (words !== undefined && words !== null && typeof words !== "string") throw new BillingError(400, "Your few words need to be plain text.");
  const picked = reason === undefined || reason === null || reason === "" ? null : reason;
  if (picked !== null && !Object.hasOwn(LEAVING_REASONS, picked)) {
    throw new BillingError(400, "Choose one of the reasons on the list, or leave the question blank.");
  }
  if (!picked && !text) return null;
  return { reason: picked ?? "other", words: text, at };
}
