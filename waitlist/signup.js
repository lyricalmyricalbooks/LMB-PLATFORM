// The waitlist sign-up handler. It checks what the page sent and stores each email once.
// Storage is passed in (`store`), so the same handler runs on whichever store is chosen and in tests with a fake.
// It uses only browser built-ins, so the page runs it as is and Node runs it in tests.

const PLANS = new Set(["shop", "stockroom", "both", "unsure"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 120, email: 254, press: 160, today: 500, source: 120 };

const clean = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The stored record's id: the same email always lands on the same record, and the id doesn't show the email. */
export async function signupId(email) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * Handles one sign-up. `store` needs two methods: `get(id)` → record or null, and `put(id, record)`.
 * Returns `{ status, body }` for the HTTP reply. Bots that fill the hidden `website` field get a quiet "ok".
 */
export async function handleSignup(input, { store, now = () => new Date() }) {
  if (!input || typeof input !== "object") return reply(400, "Please add your name and a working email.");
  if (clean(input.website, 200)) return reply(200, "ok");

  const email = clean(input.email, LIMITS.email).toLowerCase();
  const name = clean(input.name, LIMITS.name);
  if (!name || !EMAIL.test(email)) return reply(400, "Please add your name and a working email.");

  const plan = PLANS.has(input.plan) ? input.plan : "unsure";
  const id = await signupId(email);
  const existing = await store.get(id);
  const at = now().toISOString();
  await store.put(id, {
    email,
    name,
    press: clean(input.press, LIMITS.press),
    plan,
    today: clean(input.today, LIMITS.today),
    source: clean(input.source, LIMITS.source) || "direct",
    firstSignedUpAt: existing?.firstSignedUpAt ?? at,
    lastSignedUpAt: at,
    signups: (existing?.signups ?? 0) + 1,
  });
  return reply(200, "ok");
}

const reply = (status, message) => ({ status, body: { ok: status === 200, message } });
