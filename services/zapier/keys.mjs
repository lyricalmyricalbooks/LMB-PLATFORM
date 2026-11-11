// Prints Colophon's own Zapier app id and secret, for `zapier env:set` (README.md). They come from the platform's root
// secret the same way the server makes them (services/apps/ownApps.js), so nothing new is stored anywhere.
//   OWN_APPS_SECRET=… node services/zapier/keys.mjs     (or CHECKUP_SECRET, the one the server uses when that's unset)
import { ownAppId, ownAppSecret } from "../apps/ownApps.js";

const root = process.env.OWN_APPS_SECRET || process.env.CHECKUP_SECRET || "";
if (root.length < 16) {
  console.error("Set OWN_APPS_SECRET (or CHECKUP_SECRET) to the platform's secret first.");
  process.exit(1);
}
console.log(`CLIENT_ID=${ownAppId("zapier")}`);
console.log(`CLIENT_SECRET=${ownAppSecret(root, "zapier")}`);
