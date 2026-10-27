// Secret API keys must never live in the public-readable `settings/*` docs.
// They are written to the admin-only `adminSecrets/*` docs instead (see firestore.rules),
// and the public copy is blanked on every save so older leaked values are removed.

export type SecretPatch = {
  stripe?: { secretKey?: string; testSecretKey?: string };
  resend?: { apiKey?: string };
  paypal?: { clientSecret?: string; testClientSecret?: string };
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Split a `settings/website` write into a public payload with no secrets and the secrets to store privately. */
export function splitWebsiteSecrets(settings: Record<string, any>): { publicSettings: Record<string, any>; secrets: SecretPatch } {
  const publicSettings = JSON.parse(JSON.stringify(settings));
  const secrets: SecretPatch = {};
  const stripe = publicSettings.payments?.stripe;
  if (stripe) {
    const secretKey = clean(stripe.secretKey);
    const testSecretKey = clean(stripe.testSecretKey);
    if (secretKey || testSecretKey) {
      secrets.stripe = {};
      if (secretKey) secrets.stripe.secretKey = secretKey;
      if (testSecretKey) secrets.stripe.testSecretKey = testSecretKey;
    }
    stripe.secretKey = "";
    stripe.testSecretKey = "";
    delete stripe.secretKeyStored;
    delete stripe.testSecretKeyStored;
    delete stripe.publicSecretLeak;
    delete stripe.keysWerePublic;
  }
  const paypal = publicSettings.payments?.paypal;
  if (paypal) {
    const clientSecret = clean(paypal.clientSecret);
    const testClientSecret = clean(paypal.testClientSecret);
    if (clientSecret || testClientSecret) {
      secrets.paypal = {};
      if (clientSecret) secrets.paypal.clientSecret = clientSecret;
      if (testClientSecret) secrets.paypal.testClientSecret = testClientSecret;
    }
    paypal.clientSecret = "";
    paypal.testClientSecret = "";
    delete paypal.clientSecretStored;
    delete paypal.testClientSecretStored;
  }
  const comms = publicSettings.communications;
  if (comms) {
    const apiKey = clean(comms.resendApiKey);
    if (apiKey) secrets.resend = { apiKey };
    comms.resendApiKey = "";
    delete comms.resendApiKeyStored;
  }
  return { publicSettings, secrets };
}

/** Same for `settings/notifications` (Resend key under `brand`). */
export function splitNotificationSecrets(data: Record<string, any>): { publicData: Record<string, any>; secrets: SecretPatch } {
  const publicData = JSON.parse(JSON.stringify(data));
  const secrets: SecretPatch = {};
  const apiKey = clean(publicData.brand?.resendApiKey) || clean(publicData.resendApiKey);
  if (apiKey) secrets.resend = { apiKey };
  if (publicData.brand) { publicData.brand.resendApiKey = ""; delete publicData.brand.resendApiKeyStored; }
  if ("resendApiKey" in publicData) publicData.resendApiKey = "";
  return { publicData, secrets };
}

/** After a successful save: the same payload with secret values blanked and their
 *  `*Stored` flags set, for local state (the values now live in adminSecrets). */
export function scrubSavedSecrets<T extends Record<string, any>>(data: T): T {
  const out: any = JSON.parse(JSON.stringify(data || {}));
  const stripe = out.payments?.stripe;
  if (stripe) {
    if (clean(stripe.secretKey)) stripe.secretKeyStored = true;
    if (clean(stripe.testSecretKey)) stripe.testSecretKeyStored = true;
    if ("secretKey" in stripe) stripe.secretKey = "";
    if ("testSecretKey" in stripe) stripe.testSecretKey = "";
  }
  const paypal = out.payments?.paypal;
  if (paypal) {
    if (clean(paypal.clientSecret)) paypal.clientSecretStored = true;
    if (clean(paypal.testClientSecret)) paypal.testClientSecretStored = true;
    if ("clientSecret" in paypal) paypal.clientSecret = "";
    if ("testClientSecret" in paypal) paypal.testClientSecret = "";
  }
  const comms = out.communications;
  if (comms && "resendApiKey" in comms) {
    if (clean(comms.resendApiKey)) comms.resendApiKeyStored = true;
    comms.resendApiKey = "";
  }
  return out;
}

/** "" when a Stripe secret key fits its slot, otherwise a reason. */
export function stripeSecretKeyProblem(value: string, mode: "live" | "test"): string {
  const v = clean(value);
  if (!v) return "";
  if (/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(v) === false) return "This doesn't look like a Stripe secret key (it should start with sk_ or rk_).";
  const keyMode = /_(live)_/.test(v) ? "live" : "test";
  if (keyMode !== mode) return mode === "live"
    ? "That's a test key (sk_test_…). Put it in the Test secret key box; this box needs sk_live_…."
    : "That's a live key (sk_live_…). Put it in the live Secret key box; this box needs sk_test_….";
  return "";
}

/** "" when a Resend API key looks right (they start with re_ and have no spaces), otherwise a reason. A blank value is fine. */
export function resendKeyProblem(value: string): string {
  const v = clean(value);
  if (!v) return "";
  if (/\s/.test(v)) return "A Resend key has no spaces — check that you copied only the key.";
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(v)) return "This doesn't look like a Resend API key (it starts with re_). Gmail app passwords and other keys don't go here.";
  return "";
}
