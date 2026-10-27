// Pure verdicts for Settings › Payments › Stripe (Test connection, Webhook health).
// The UI only renders these; tests pin the rules.

export type Check = { tone: "success" | "warning" | "danger" | "neutral"; text: string };

type ModeResult = {
  source: "stored" | "functions" | "none";
  publishableKeyMode: "live" | "test" | "invalid" | "missing";
  keyMode?: string; ok?: boolean; accountId?: string | null; accountName?: string | null;
  chargesEnabled?: boolean; error?: string;
};
export type KeyReport = { activeMode: "live" | "test"; live: ModeResult; test: ModeResult; sameAccount: boolean | null };

const label = (mode: "live" | "test") => (mode === "live" ? "Live" : "Test (sandbox)");

/** One line per finding, the active mode first. Any "danger" means checkout in that mode fails. */
export function describeKeyReport(report: KeyReport): Check[] {
  const out: Check[] = [];
  const modes: Array<"live" | "test"> = report.activeMode === "live" ? ["live", "test"] : ["test", "live"];
  for (const mode of modes) {
    const r = report[mode];
    const active = mode === report.activeMode;
    const name = `${label(mode)}${active ? " (in use)" : ""}`;
    if (r.source === "none") {
      out.push({ tone: active ? "danger" : "neutral", text: `${name}: no secret key — ${active ? "checkout can't take payments" : "not set up"}.` });
    } else if (r.ok === false) {
      out.push({ tone: active ? "danger" : "warning", text: `${name}: Stripe rejected the secret key — ${r.error || "check it in the Stripe dashboard"}.` });
    } else if (r.keyMode && r.keyMode !== mode) {
      out.push({ tone: active ? "danger" : "warning", text: `${name}: the secret key is a ${r.keyMode} key. Put an sk_${mode}_… key here.` });
    } else {
      const who = r.accountName || r.accountId;
      out.push({ tone: "success", text: `${name}: secret key works${who ? ` (account ${who})` : ""}${r.source === "functions" ? " — from Firebase Functions" : ""}.` });
      if (r.chargesEnabled === false && mode === "live") out.push({ tone: "danger", text: "Live: Stripe hasn't enabled charges on this account yet — finish activation in the Stripe dashboard." });
    }
    if (r.source !== "none" || active) {
      if (r.publishableKeyMode === "missing") out.push({ tone: active ? "danger" : "neutral", text: `${name}: publishable key is missing.` });
      else if (r.publishableKeyMode === "invalid") out.push({ tone: active ? "danger" : "warning", text: `${name}: publishable key isn't a Stripe key (pk_${mode}_…).` });
      else if (r.publishableKeyMode !== mode) out.push({ tone: active ? "danger" : "warning", text: `${name}: publishable key is a ${r.publishableKeyMode} key — it must be pk_${mode}_….` });
    }
  }
  if (report.sameAccount === false) out.push({ tone: "warning", text: "Your live and test keys belong to different Stripe accounts. That's fine only if intended — payments and webhooks are per account." });
  return out;
}

export type WebhookReport = {
  found: boolean; enabled: boolean; wrongUrl: boolean; missingEvents: string[];
  savedSecret: boolean; deployedSecret?: boolean;
  lastReceivedAt: string | null; lastFailureAt: string | null;
  lastProcessingFailureAt?: string | null;
};

export type WebhookState = {
  /** healthy = set up and has delivered; waiting = set up, no delivery yet. */
  state: "healthy" | "waiting" | "needs-fix" | "signature-failing";
  signatureFailing: boolean;
  processingFailing: boolean;
  noSecret: boolean;
};

const newer = (a?: string | null, b?: string | null) => !!a && (!b || a > b);

export function webhookState(r: WebhookReport): WebhookState {
  const signatureFailing = newer(r.lastFailureAt, r.lastReceivedAt);
  const processingFailing = newer(r.lastProcessingFailureAt, r.lastReceivedAt);
  // deployedSecret undefined = older backend that doesn't report it: don't guess.
  const noSecret = !r.savedSecret && r.deployedSecret === false;
  const configOk = r.found && r.enabled && !r.wrongUrl && r.missingEvents.length === 0;
  let state: WebhookState["state"];
  if (signatureFailing) state = "signature-failing";
  else if (!configOk || noSecret) state = "needs-fix";
  else if (!r.lastReceivedAt) state = "waiting";
  else state = "healthy";
  return { state, signatureFailing, processingFailing, noSecret };
}
