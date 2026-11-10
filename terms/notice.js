// Telling presses already on Colophon that the terms changed (10 November 2026). The terms promise an email at least
// CHANGE_NOTICE_DAYS before new words apply, and the chance to cancel first. This daily job keeps that promise.
//
//   createTermsNotice({ signups, email, settings, now })
//     sweep()  for each press whose agreement is to older words: emails it once per version ("terms-changed", with
//              what changed and the date the new words apply), and records it on the sign-up row
//              (termsNotices[version] = { sentAt, appliesOn }). From that date the row records the new version, as
//              agreed by notice (termsAgreedBy: "notice"); a press can cancel before then. Safe to repeat.
import { CHANGE_NOTICE_DAYS, CHANGES, TERMS_VERSION } from "./terms.js";

const DAY_MS = 86_400_000;
/** Rows that never became, or are no longer, a press on Colophon. */
const NOT_A_PRESS = new Set(["expired", "failed"]);

const dayText = (iso) => new Date(iso).toLocaleDateString("en-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" });

export function createTermsNotice({ signups, email, settings, now = () => new Date() }) {
  return {
    async sweep() {
      const told = [], moved = [], failed = [];
      const at = now();
      const base = (settings ? await settings() : {})?.platformUrl ?? "";
      for (const row of await signups.list()) {
        if (!row?.termsAcceptedAt || row.termsVersion === TERMS_VERSION || NOT_A_PRESS.has(row.status)) continue;
        try {
          const sent = row.termsNotices?.[TERMS_VERSION];
          if (!sent) {
            if (!row.ownerEmail) throw new Error("no owner email to tell");
            const appliesOn = new Date(at.getTime() + CHANGE_NOTICE_DAYS * DAY_MS).toISOString();
            await email.sendPlatform({
              kind: "terms-changed", to: row.ownerEmail, shopId: row.shopId, idempotencyKey: `terms/${row.shopId}/${TERMS_VERSION}`,
              data: { pressName: row.pressName ?? row.shopId, changes: CHANGES.en, changesFr: CHANGES.fr, appliesOn: dayText(appliesOn), link: `${base}/terms/`, billing: `${base}/account/billing?shop=${encodeURIComponent(row.shopId)}` },
            });
            await signups.set(row.shopId, { ...row, termsNotices: { ...(row.termsNotices ?? {}), [TERMS_VERSION]: { sentAt: at.toISOString(), appliesOn } } });
            told.push(row.shopId);
          } else if (Date.parse(sent.appliesOn) <= at.getTime()) {
            await signups.set(row.shopId, { ...row, termsVersion: TERMS_VERSION, termsAcceptedAt: at.toISOString(), termsAgreedBy: "notice", termsEarlier: [...(row.termsEarlier ?? []), { termsVersion: row.termsVersion, termsAcceptedAt: row.termsAcceptedAt }] });
            moved.push(row.shopId);
          }
        } catch (failure) {
          failed.push(`${row.shopId}: ${failure.message}`);
        }
      }
      if (failed.length) throw new Error(`The terms notice finished, but ${failed.length} press${failed.length > 1 ? "es" : ""} had trouble: ${failed.join("; ")}`);
      return { told, moved };
    },
  };
}
