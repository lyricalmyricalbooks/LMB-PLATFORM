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
