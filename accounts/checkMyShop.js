// "Check my shop" for owners (plan 14.3). One button runs the checks the control room has on the owner's own shop and
// says each result in plain words, with a button that fixes it where the owner can. No technical words (plan 6.16).
//
//   checkMyShop({ row, profile, now, shopBackupAt? }) -> { ok, results: [{ id, state, title, words, fix? }] }
//
//   state "ok"       all good
//   state "fix"      something is wrong and the owner can fix it: `fix` is { label, to } (`to` is "billing", "admin" or
//                    "help": the page decides the address)
//   state "unknown"  can't be told from here yet; the words say what that means
//
// `row` is the shop's registry row, `profile` its saved public profile (null before it is made). `shopBackupAt` is when
// the shop last saved its own nightly copy (an ISO time, read by the caller from the shop), or undefined if not read.
const HOURS = 3600_000;

const result = (id, state, title, words, fix) => ({ id, state, title, words, ...(fix ? { fix } : {}) });

export function checkMyShop({ row, profile, now = new Date(), shopBackupAt }) {
  const apps = profile?.apps ?? {};
  const results = [];

  // Address
  results.push(profile?.siteUrl
    ? result("address", "ok", "Your shop's web address", `People can find your shop at ${profile.siteUrl.replace(/^https?:\/\//, "")}.`)
    : result("address", "fix", "Your shop's web address", "Your shop doesn't have a web address yet. A person at Colophon needs to finish setting it up.", { label: "Ask for help", to: "help" }));

  // Payments
  if (apps.shop !== false) {
    results.push(profile?.payments?.provider
      ? result("payments", "ok", "Taking payments", "Your customers can pay by card, and the money goes into your own payments account.")
      : result("payments", "fix", "Taking payments", "Your shop can't take card payments yet. Connect your payments account and you can start selling.", { label: "Connect payments", to: "admin" }));
  }

  // Email
  const sender = row?.emailSender;
  if (sender?.state === "broken") {
    results.push(result("email", "fix", "Emails to your customers", "Emails from your own address have stopped. Customers still get their emails, from Colophon's address, until this is fixed.", { label: "Ask for help", to: "help" }));
  } else {
    results.push(result("email", "ok", "Emails to your customers", sender?.state === "on" ? `Order emails go out from ${sender.address}.` : "Order emails go out in your press's name."));
  }

  // The shop and the stockroom
  if (apps.shop && apps.stockroom) {
    results.push(profile.stockroom?.firestoreDatabase
      ? result("stock", "ok", "Your shop and stockroom", "Your stockroom and your shop count the same books, so a sale at a fair shows on the website.")
      : result("stock", "fix", "Your shop and stockroom", "Your stockroom isn't joined to your shop yet, so a sale at a fair won't show on the website.", { label: "Ask for help", to: "help" }));
  }

  // Backups
  if (shopBackupAt === undefined) {
    results.push(result("backups", "unknown", "Saved copies of your shop", "Your shop saves a copy of everything every night. We can't read the last one from here yet; the platform checks them for you too."));
  } else if (shopBackupAt && now - Date.parse(shopBackupAt) <= 36 * HOURS) {
    results.push(result("backups", "ok", "Saved copies of your shop", "Your shop saved a copy of everything in the last day and a half."));
  } else {
    results.push(result("backups", "fix", "Saved copies of your shop", "Your shop hasn't saved a copy of everything in over a day and a half. We've been told, and a person will look.", { label: "Ask for help", to: "help" }));
  }

  // The plan and the card
  const billing = row?.billing;
  if (billing?.access === "paused") {
    results.push(result("plan", "fix", "Your plan", "Your plan is paused until a card is added. Your shop is closed to customers until then.", { label: "Add a card", to: "billing" }));
  } else if (billing?.status === "past_due") {
    results.push(result("plan", "fix", "Your plan", "Your last payment didn't go through. Update your card to keep your shop open.", { label: "Update your card", to: "billing" }));
  } else if (billing?.status === "trialing" && !billing.hasCard) {
    results.push(result("plan", "ok", "Your plan", "You're on your free trial. Add a card before it ends so your shop stays open.", undefined));
  } else {
    results.push(result("plan", "ok", "Your plan", "Your plan is in good standing."));
  }

  return { ok: results.every((r) => r.state !== "fix"), results };
}
