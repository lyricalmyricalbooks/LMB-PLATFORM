// The platform's nightly business run (code plan 19.7, 19.9): tonight's income record (incomeHistory.js) and the
// card-expiry warnings (services/billing/cardExpiry.js, through billing's `cardExpiryReminders`). Each part runs even
// when the other fails, and both are safe to run twice the same night: the income record is overwritten with the same
// numbers, and a card is only ever warned about once per expiry date.
//
//   runBusinessNightly({ registry, settings, incomeHistory, billing, now, print }) -> { ok, income, cardWarnings, problems }
//
// `settings` is the live platform settings (services/settings.js liveSettings: prices and currency). `billing` is the
// billing service (services/billing); until billing has its hosted home the real run below has none, and says so.
//
// For real (a schedule calls it once a night; nothing in the platform's tests runs it):
//
//   node control-room/nightly.js
import { pathToFileURL } from "node:url";
import { firestoreClient } from "../clients/firestore.js";
import { firestoreRegistry } from "../clients/registry.js";
import { firestoreIncomeHistory, firestorePlatformState } from "../clients/stores.js";
import { gcloudToken } from "../release-check/run.js";
import { PLATFORM_PROJECT } from "../setup/real.js";
import { liveSettings } from "../services/settings.js";
import { snapshotIncome } from "./incomeHistory.js";

const message = (error) => (error instanceof Error ? error.message : String(error));

export async function runBusinessNightly({ registry, settings, incomeHistory, billing = null, now = () => new Date(), print = () => {} }) {
  const problems = [];
  let income = null;
  let cardWarnings = null;
  try {
    const record = await snapshotIncome({ registry, settings, store: incomeHistory, now: now() });
    income = { day: record.day, incomeCents: record.incomeCents, paying: record.paying };
    print(`Income for ${record.day}: ${record.incomeCents} cents a month from ${record.paying} paying shop${record.paying === 1 ? "" : "s"}.`);
  } catch (error) {
    problems.push(`income: ${message(error)}`);
    print(`The income record wasn't written: ${message(error)}`);
  }
  if (billing) {
    try {
      cardWarnings = await billing.cardExpiryReminders();
      print(`Card warnings sent: ${cardWarnings.length}.`);
    } catch (error) {
      problems.push(`card warnings: ${message(error)}`);
      print(`The card warnings didn't run: ${message(error)}`);
    }
  } else {
    print("Card warnings: billing isn't running here yet, so none were checked.");
  }
  return { ok: problems.length === 0, income, cardWarnings, problems };
}

/** The real run: the platform project's registry and records. Billing joins once it is hosted (services/billing/README.md). */
export async function realBusinessNightly({ env = process.env, fetch = globalThis.fetch, print = console.log } = {}) {
  const platform = firestoreClient({ fetch, token: gcloudToken, projectId: PLATFORM_PROJECT });
  const settings = await liveSettings({ env, store: firestorePlatformState(platform) });
  return runBusinessNightly({ registry: firestoreRegistry(platform), settings, incomeHistory: firestoreIncomeHistory(platform), print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await realBusinessNightly();
  process.exitCode = result.ok ? 0 : 1;
}
