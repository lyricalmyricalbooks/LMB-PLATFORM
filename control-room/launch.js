// The control room's Launch page: what the platform still needs before presses sign up, and the walk through the whole
// sign-up as a press. Pure, so every word and every "needs" is tested without a browser; app.js draws it.

/** Where the walkthrough's ticks are kept, on this computer only. */
export const WALK_STORE = "cr-launch-walk";

/**
 * The things to have in place, from GET /control/launch and GET /control/test-shop, each ready or not. `testShops` is
 * the list of test shops (or one, as before): ready when there is at least one and every one is live.
 */
export function launchChecks(launch, testShops) {
  // An optional piece (receipts by email) never holds the launch back.
  const checks = launch.keys.filter((key) => !key.optional).map((key) => ({ id: key.id, ready: key.ready }));
  const tests = (Array.isArray(testShops) ? testShops : [testShops]).filter(Boolean);
  checks.push({ id: "test-shop", ready: tests.length > 0 && tests.every((shop) => shop.status === "live") });
  checks.push({ id: "signup", ready: launch.signupOpen || launch.invites });
  return checks;
}

/** "3 of 6 ready", and how many still need you, for the page and its menu badge. */
export function launchSummary(launch, testShops) {
  const checks = launchChecks(launch, testShops);
  const ready = checks.filter((c) => c.ready).length;
  return { ready, total: checks.length, missing: checks.length - ready };
}

const REPO = "https://github.com/lyricalmyricalbooks/LMB-PLATFORM";
/** Where the server's plain settings live (deploy.yml reads the repository variable SERVER_SETTINGS). */
export const SETTINGS_PAGE = `${REPO}/settings/variables/actions/SERVER_SETTINGS`;
export const DEPLOY_PAGE = `${REPO}/actions/workflows/deploy.yml`;
export const TEST_SHOP_PAGE = `${REPO}/actions/workflows/test-shop.yml`;
const DEPLOY_STEP = { text: "Back here, press Run Deploy the platform and wait for it to finish (about 5 minutes).", href: DEPLOY_PAGE, linkWords: "Run Deploy the platform" };

// Stripe's events each endpoint must send: the ones services/payments and services/billing handle.
export const CONNECT_EVENTS = Object.freeze(["account.updated", "account.application.deauthorized", "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "payment_intent.succeeded", "payment_intent.canceled", "charge.refunded"]);
export const BILLING_EVENTS = Object.freeze(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.trial_will_end", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "payment_method.automatically_updated"]);

/**
 * Each launch piece as a to-do in plain words: a title that says what to do, one line on why, the how-to in short
 * numbered steps (a step may carry `copy`, the exact words to paste), one main button, and `details` (the technical
 * names) for the page to keep folded away.
 */
const KEY_STEPS = {
  stripe: (key, ctx) => ({
    title: "Add your Stripe test key",
    why: "Lets brands start plans, save cards and connect their own Stripe.",
    action: { href: key.getIt, words: "Open Stripe" },
    how: [
      { text: "In Stripe, reveal the Secret key and copy it." },
      secretStep(key, ctx),
      DEPLOY_STEP,
    ],
  }),
  "connect-events": (key, ctx) => ({
    title: "Let Stripe tell Colophon about brands' sales",
    why: "Keeps each brand's orders, refunds and payouts up to date.",
    action: { href: "https://dashboard.stripe.com/test/webhooks", words: "Open Stripe" },
    how: [
      { text: "In Stripe, add a destination for events from connected accounts, at this address:", copy: key.events },
      { text: "Tick these events:", list: CONNECT_EVENTS },
      { text: "Save it, then copy its signing secret." },
      secretStep(key, ctx),
      DEPLOY_STEP,
    ],
  }),
  "billing-events": (key, ctx) => ({
    title: "Let Stripe tell Colophon about plan payments",
    why: "Marks each brand's plan as paid, failed or ended.",
    action: { href: "https://dashboard.stripe.com/test/webhooks", words: "Open Stripe" },
    how: [
      { text: "In Stripe, add a destination for events from your own account, at this address:", copy: key.events },
      { text: "Tick these events:", list: BILLING_EVENTS },
      { text: "Save it, then copy its signing secret." },
      secretStep(key, ctx),
      DEPLOY_STEP,
    ],
  }),
  email: (key) => ({
    title: "Send email from your Google Workspace",
    why: "Sign-in codes, receipts and every email to brands go out from your notifications mailbox.",
    action: { href: key.getIt, words: "Open Google Admin" },
    how: [
      { text: "In Google Admin, allow the platform's mail account to send as your notifications mailbox (the deploy log shows its number)." },
      settingStep(key),
      DEPLOY_STEP,
    ],
  }),
  "receipt-mail": (key) => ({
    title: "Turn on receipts by email",
    why: "Brands forward receipts to their own address and check them in Bookkeeping.",
    action: { href: key.getIt, words: "Open Google Admin" },
    how: [{ text: "In Google Admin, allow the platform's mail account to read the receipts mailbox." }, settingStep(key), DEPLOY_STEP],
  }),
  "bank-feed": (key) => ({
    title: "Turn on the bank feed add-on",
    why: "Brands connect their bank through Plaid and add the feed to their plan.",
    action: { href: key.getIt, words: "Open Plaid" },
    how: [{ text: "In Plaid, copy your keys and add them in Google Cloud's secret store." }, settingStep(key), DEPLOY_STEP],
  }),
};

function secretStep(key, { secretsPage }) {
  return { text: "In Google Cloud's secret store, make a new secret with this name and paste it as the value:", copy: key.secret, href: secretsPage, linkWords: "Open the secret store" };
}
function settingStep(key) {
  return { text: "In GitHub, add this line to the server settings:", copy: key.setting, href: SETTINGS_PAGE, linkWords: "Open the server settings" };
}

/**
 * The Launch page's to-do list, in order. `required` steps count towards "ready to open"; `extras` never hold the
 * launch back. Each step: { id, title, why, done, how, action, details }.
 */
export function launchSteps(launch, testShops) {
  const secretsPage = launch.project ? `https://console.cloud.google.com/security/secret-manager?project=${encodeURIComponent(launch.project)}` : "https://console.cloud.google.com/security/secret-manager";
  const ctx = { secretsPage };
  const keyStep = (key) => ({
    id: key.id, done: key.ready, optional: Boolean(key.optional),
    ...(KEY_STEPS[key.id] ?? (() => ({ title: key.label, why: key.gives, how: [], action: key.getIt ? { href: key.getIt, words: "Open" } : null })))(key, ctx),
    details: [key.secret ? `Secret: ${key.secret}` : null, key.setting ? `Setting: ${key.setting}` : null, key.events ? `Events address: ${key.events}` : null].filter(Boolean),
  });
  const tests = (Array.isArray(testShops) ? testShops : [testShops]).filter(Boolean);
  const testsLive = tests.length > 0 && tests.every((shop) => shop.status === "live");
  const required = [
    ...launch.keys.filter((key) => !key.optional).map(keyStep),
    ...(launch.shopMaking ? [] : [{
      id: "shop-making", done: false, title: "Let the platform make brands' stores",
      why: "A new brand's store waits on Setting up until this is on.",
      how: [{ text: "In GitHub, add the shared shops project and its web address to the server settings.", href: SETTINGS_PAGE, linkWords: "Open the server settings" }, DEPLOY_STEP],
      action: { href: SETTINGS_PAGE, words: "Open the server settings" }, details: ["Settings: SHARED_SHOPS_PROJECT, SHARED_SHOPS_DOMAIN"],
    }]),
    {
      id: "test-shop", done: testsLive, title: "Make your test shops",
      why: "A book shop and a general shop to try every change on before brands see it.",
      how: [{ text: "In GitHub, press Run workflow on Make the test shop and wait for it to finish." }, { text: "Come back here: each test shop shows Live." }],
      action: { href: TEST_SHOP_PAGE, words: "Open Make the test shop" }, details: [],
    },
    {
      id: "signup", done: Boolean(launch.signupOpen || launch.invites), title: "Choose who can sign up",
      why: launch.signupOpen ? "Anyone with the address can start a shop." : "Only people you invite from the waitlist can start a shop.",
      how: [], action: null, details: [], signup: true,
    },
  ];
  const extras = launch.keys.filter((key) => key.optional).map(keyStep);
  return { required, extras, next: required.find((step) => !step.done) ?? null };
}

/**
 * "Connect Google" as a to-do: each thing outside the code, from GET /control/google-ready (google/readiness.js), with
 * where to do it. Done when every item is.
 */
export function googleSteps(ready) {
  const items = Array.isArray(ready?.items) ? ready.items : [];
  return items.map((item) => ({
    id: `google-${item.id}`, done: Boolean(item.done), title: item.title, why: item.words,
    how: item.setting ? [{ text: "When it's done, add this line to the server settings:", copy: item.setting, href: SETTINGS_PAGE, linkWords: "Open the server settings" }, DEPLOY_STEP] : [],
    action: item.href ? { href: item.href, words: item.hrefWords ?? "Open" } : null,
    details: item.setting ? [`Setting: ${item.setting}`] : [],
  }));
}

/**
 * The walk, in a press's order. Each step: what to open, what to try, and `needs`, the things on this page it waits
 * for (empty when it can be tried now).
 */
export function walkSteps(launch) {
  const base = launch.platformUrl;
  const missing = (...ids) => ids.map((id) => launch.keys.find((k) => k.id === id)).filter((k) => k && !k.ready)
    .map((k) => (KEY_STEPS[k.id] ? KEY_STEPS[k.id](k, { secretsPage: "" }).title : k.label));
  const signUp = launch.signupOpen ? [] : launch.invites ? ["an invite for your test address (Sign-ups)"] : ["sign-up open to anyone"];
  // Since 10 November 2026 sign-up makes the store and stockroom at once, on a trial of both apps (#470).
  return [
    { id: "front", title: "The front page", href: `${base}/`, try: "What a press sees first. Press Start your free trial.", needs: [] },
    {
      id: "join", title: "Start a shop", href: `${base}/join/`,
      try: "Use an address you read with +test added (you+test1@…), so each try is a new press. The code comes by email, then one screen of questions and Start my free trial. The store and stockroom are made while you wait.",
      needs: [...missing("email"), ...signUp, ...(launch.shopMaking ? [] : ["the platform's Google access, so it can make a store"])],
    },
    {
      id: "cards", title: "Set up the store", href: null,
      try: "Press Go to my store. Choose a look, then Settings › Payments: connect Stripe with its test details.",
      needs: missing("stripe", "connect-events"),
    },
    {
      id: "billing", title: "Plan and billing", href: `${base}/account/`,
      try: "The trial covers both apps. Change the plan, or add a card: 4242 4242 4242 4242, any future date, any three digits. 4000 0025 0000 3155 asks the bank to confirm first.",
      needs: missing("stripe", "billing-events"),
    },
    { id: "open", title: "Open my shop", href: null, try: "The final check on the store's Home, then Open my shop. Buy something with the test card.", needs: [] },
    { id: "see", title: "See it here", href: "#setting-up", try: "The press shows in Setting up as Not open yet, then Open to shoppers. Its emails are in its record.", needs: [] },
  ];
}

/** The ticked steps, read safely: a blocked or empty store reads as none ticked. */
export function readTicks(storage) {
  try {
    const list = JSON.parse(storage?.getItem(WALK_STORE) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Saves the ticks; a store that refuses is ignored (the ticks then last until the page closes). */
export function saveTicks(storage, ticks) {
  try {
    storage?.setItem(WALK_STORE, JSON.stringify([...ticks]));
  } catch {
    // Private window or blocked storage: nothing to keep.
  }
}
