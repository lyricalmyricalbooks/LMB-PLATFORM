// The control room's Launch page: what the platform still needs before presses sign up, and the walk through the whole
// sign-up as a press. Pure, so every word and every "needs" is tested without a browser; app.js draws it.

/** Where the walkthrough's ticks are kept, on this computer only. */
export const WALK_STORE = "cr-launch-walk";

/** The things to have in place, from GET /control/launch and GET /control/test-shop, each ready or not. */
export function launchChecks(launch, testShop) {
  const checks = launch.keys.map((key) => ({ id: key.id, ready: key.ready }));
  checks.push({ id: "test-shop", ready: Boolean(testShop && testShop.status === "live") });
  checks.push({ id: "signup", ready: launch.signupOpen || launch.invites });
  return checks;
}

/** "3 of 6 ready", and how many still need you, for the page and its menu badge. */
export function launchSummary(launch, testShop) {
  const checks = launchChecks(launch, testShop);
  const ready = checks.filter((c) => c.ready).length;
  return { ready, total: checks.length, missing: checks.length - ready };
}

/**
 * The walk, in a press's order. Each step: what to open, what to try, and `needs`, the things on this page it waits
 * for (empty when it can be tried now).
 */
export function walkSteps(launch) {
  const base = launch.platformUrl;
  const missing = (...ids) => ids.map((id) => launch.keys.find((k) => k.id === id)).filter((k) => k && !k.ready).map((k) => k.label);
  const signUp = launch.signupOpen ? [] : launch.invites ? ["an invite for your test address (Sign-ups)"] : ["sign-up open to anyone"];
  return [
    { id: "front", title: "The front page", href: `${base}/`, try: "What a press sees first. Press Start your free trial.", needs: [] },
    {
      id: "join", title: "Start a shop", href: `${base}/join/`,
      try: "Use an address you read with +test added (you+test1@…), so it is a new press each time. The six-digit code comes by email, then four quick questions.",
      needs: [...missing("email"), ...signUp],
    },
    { id: "setup", title: "The setup guide", href: `${base}/app/`, try: "Choose a look, pick Stripe or Square, and bring a product file over if you like.", needs: [] },
    {
      id: "billing", title: "Plan and billing", href: `${base}/account/`,
      try: "Add a card: 4242 4242 4242 4242, any future date, any three digits. 4000 0025 0000 3155 asks the bank to confirm first.",
      needs: missing("stripe", "billing-events"),
    },
    {
      id: "create", title: "Create my shop", href: `${base}/app/`, try: "From the setup guide's Home. The shop is made privately; follow it on Setting up.",
      needs: launch.shopMaking ? [] : ["the platform's Google access, so it can make a shop"],
    },
    {
      id: "cards", title: "Take card payments", href: null, try: "In the new shop's admin, Settings › Payments. Connect Stripe with its test details.",
      needs: missing("stripe", "connect-events"),
    },
    { id: "open", title: "Open my shop", href: null, try: "The final check on the shop's Home, then Open my shop. Buy something with the test card.", needs: [] },
    { id: "see", title: "See it here", href: "#setting-up", try: "The new press shows in Setting up, then in Shops. Check its emails in its record.", needs: [] },
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
