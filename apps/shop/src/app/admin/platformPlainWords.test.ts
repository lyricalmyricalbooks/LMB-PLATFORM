// Code plan 6.16: nothing technical reaches a press. A shop run by Colophon (its cards go through the platform) must show
// its press no Firebase, Google Cloud, API, key, webhook, secret, DNS, CNAME, TXT, Resend or deploy. The list is the
// platform's one list, plain-words/banned.json (also read by the platform's own pages and emails and by the stockroom).
//
// Two ways of reading the shop's admin:
//   1. Every word in the admin's source (strings and JSX text) is read. A banned word passes only when it sits where a
//      Colophon shop can't reach it (behind runsOnColophon(), platformCards, `<OwnAccountOnly>` and the like, found by
//      reading the code's own structure), on a line marked `Own-account shops only`, or is an allowed plain use.
//   2. The screens and messages a Colophon shop does reach are built with pretend data and read as the press sees them.
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createRequire } from "node:module";
// TypeScript 7 (the compiler) has no JS API; Microsoft's @typescript/typescript6 keeps the classic parser for tools like this.
import ts from "@typescript/typescript6";
import { backupAlert, buildAdminAlerts, cardAccountAlert, checkFailedAlert, inventoryLinkAlerts, settingsAlerts } from "./adminAlerts";
import { launchReadiness } from "./launchReadiness";
import { paymentHealth } from "./paymentHealth";
import { testSaleSteps } from "./testSaleWalkthrough";
import { attentionReason, rowStatus } from "./ordersDesk";
import { emailLogBadge, emailLogDetail } from "./emailLogDisplay";

const SHOP = join(__dirname, "..", "..", "..");
const BANNED: { word: string; regex: RegExp }[] = (JSON.parse(readFileSync(join(SHOP, "..", "..", "plain-words", "banned.json"), "utf8")).banned as any[])
  .map((b) => ({ word: b.word, regex: new RegExp(b.pattern, b.flags) }));

/** Banned words in `text`, after taking out the phrases allowed to stay. */
function banned(text: string, allowed: readonly string[] = ALLOWED): string[] {
  let rest = text;
  for (const phrase of allowed) rest = rest.split(phrase).join(" ");
  return BANNED.filter((b) => b.regex.test(rest)).map((b) => b.word);
}

// Words used in their plain, non-technical sense. Each phrase stays only because of the reason beside it.
const ALLOWED: readonly string[] = [
  // The keyboard's keys, not a secret key: Studio's shortcut help and the photo cropper's hint.
  "arrow keys", "Arrow keys", "Plain-key shortcuts",
  // "Key" meaning "main": the Overview's headline numbers and the search words that find that card.
  "Key figures", "key metrics", "kpi totals stats key",
  // "Resend" as a verb on a button that sends an email again, not the email company.
  "Resend email", "Resend shipping email", "Resend order confirmation", "resend the email", "or resend it",
];

// ── 1. Every word in the admin's source ────────────────────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

// (The release notes in /updates/ are read too: the What's new box shows them to a press.)
const SKIP = /\.test\.|\/fixture\/|\.d\.ts$/;
// Not read here, with the reason:
//  - CustomDomainCard.tsx is the domain card, row 6.15's (its words about a registrar's records are rewritten there).
//  - studio/previewBridge.ts, canvasBridge.ts, gridBridge.ts hold JavaScript that runs inside the preview page; their
//    strings are code, not words.
const NOT_READ = new Set(["src/app/admin/CustomDomainCard.tsx", "src/app/admin/studio/previewBridge.ts", "src/app/admin/studio/canvasBridge.ts", "src/app/admin/studio/gridBridge.ts"]);

/** A line carrying this comment is code only a shop on its own keys reaches (Stripe's own keys, a carrier account, a mail account). */
const MARKERS = ["Own-account shops only", "Stripe shops only"];

// How the code says "this is a Colophon shop". A positive name is true on Colophon; a negative one is true elsewhere.
const POSITIVE_NAMES = new Set(["colophon", "onColophon", "platformCards", "sharedBackup", "platform"]);
const POSITIVE_CALLS = new Set(["runsOnColophon", "platformCardsProvider", "platformTakesCards"]);
const NEGATIVE_CALLS = new Set(["aiWriterAvailable"]);
// Wrappers whose children a Colophon shop never renders.
const OWN_ONLY_TAGS = new Set(["OwnAccountOnly", "OwnKeysOnly"]);

/** "colophon" when `expr` being true means a Colophon shop, "other" when it means any other shop, else null. */
function side(expr: ts.Expression): "colophon" | "other" | null {
  if (ts.isParenthesizedExpression(expr)) return side(expr.expression);
  if (ts.isIdentifier(expr)) return POSITIVE_NAMES.has(expr.text) ? "colophon" : null;
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    if (POSITIVE_CALLS.has(expr.expression.text)) return "colophon";
    if (NEGATIVE_CALLS.has(expr.expression.text)) return "other";
  }
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = side(expr.operand);
    return inner === "colophon" ? "other" : inner === "other" ? "colophon" : null;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return side(expr.left) ?? side(expr.right);
  return null;
}

const within = (node: ts.Node, child: ts.Node) => child.pos >= node.pos && child.end <= node.end;
const endsInReturn = (s: ts.Statement): boolean => ts.isReturnStatement(s) || ts.isThrowStatement(s) || (ts.isBlock(s) && s.statements.some(endsInReturn));

/** Is this node somewhere only a shop that is not run by Colophon can reach? */
function unreachableOnColophon(node: ts.Node): boolean {
  let child: ts.Node = node;
  for (let n: ts.Node | undefined = node.parent; n; child = n, n = n.parent) {
    if (ts.isConditionalExpression(n)) {
      const s = side(n.condition);
      if ((within(n.whenTrue, child) && s === "other") || (within(n.whenFalse, child) && s === "colophon")) return true;
    } else if (ts.isIfStatement(n)) {
      const s = side(n.expression);
      if ((within(n.thenStatement, child) && s === "other") || (n.elseStatement && within(n.elseStatement, child) && s === "colophon")) return true;
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (within(n.right, child) && side(n.left) === "other") return true;
    } else if (ts.isJsxElement(n) && OWN_ONLY_TAGS.has(n.openingElement.tagName.getText()) && child !== n.openingElement && child !== n.closingElement) {
      return true;
    } else if (ts.isBlock(n) || ts.isSourceFile(n)) {
      // `if (colophon) return …;` earlier in the same block: everything after it is for other shops.
      for (const s of n.statements) {
        if (s.pos >= child.pos) break;
        if (ts.isIfStatement(s) && !s.elseStatement && side(s.expression) === "colophon" && endsInReturn(s.thenStatement)) return true;
      }
    }
  }
  return false;
}

/** The words in a file's source that a press could read, with where they are. */
function wordsIn(path: string): { at: string; text: string; node: ts.Node; sf: ts.SourceFile }[] {
  const file = join(SHOP, path);
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { at: string; text: string; node: ts.Node; sf: ts.SourceFile }[] = [];
  const visit = (node: ts.Node) => {
    // Developer logs never reach a press; an import's path and a type's name are not words.
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText())) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.getText();
    // A string that is one lower-case token (an id, a CSS name, a field) is code; sentences and labels are words.
    if (text !== null && text.trim() && (/\s/.test(text.trim()) || /^[A-Z]/.test(text.trim()))) {
      found.push({ at: `${path}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, text: text.trim().replace(/\s+/g, " "), node, sf });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function markedOwnAccount(sf: ts.SourceFile, node: ts.Node): boolean {
  const lines = sf.text.split("\n");
  const first = sf.getLineAndCharacterOfPosition(node.getStart()).line;
  const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  return lines.slice(first, last + 1).some((line) => MARKERS.some((m) => line.includes(m)));
}

// Components that only a shop on its own accounts ever draws. Every use of each must sit where Colophon can't reach it
// (checked below), so their words are not read: they are never shown to a press.
const OWN_ACCOUNT_COMPONENTS: Record<string, string> = {
  "src/app/admin/AiWriterCard.tsx": "AiWriterCard",
  "src/app/admin/AddressFinderCard.tsx": "AddressFinderCard",
  "src/app/admin/GoogleAnalyticsCard.tsx": "GoogleAnalyticsCard",
  "src/app/admin/SearchConsoleCard.tsx": "SearchConsoleCard",
  "src/app/admin/StripeWebhookHealth.tsx": "StripeWebhookHealth",
  "src/app/admin/GmailSendingCard.tsx": "GmailSendingCard",
  "src/app/admin/MerchantFeedDialog.tsx": "MerchantFeedDialog",
  "src/app/admin/GoogleIndexDialog.tsx": "GoogleIndexDialog",
  // Only Stripe's own-keys card (StripeWebhookHealth) reads these.
  "src/app/admin/stripeChecks.ts": "",
};
const ADMIN_FILES = walk(join(SHOP, "src/app/admin")).map((f) => relative(SHOP, f).split(sep).join("/")).filter((f) => /\.tsx?$/.test(f) && !SKIP.test(f) && !NOT_READ.has(f));

describe("the shop's admin: every word a Colophon shop's press can read", () => {
  it("reads every file in the admin", () => {
    expect(ADMIN_FILES.length).toBeGreaterThan(120);
    expect(ADMIN_FILES).toContain("src/app/admin/ShopSettings.tsx");
    expect(ADMIN_FILES).toContain("src/app/admin/launchReadiness.ts");
  });

  it("no technical word sits where a Colophon shop can reach it", () => {
    const found: string[] = [];
    for (const path of ADMIN_FILES) {
      if (path in OWN_ACCOUNT_COMPONENTS) continue;
      for (const w of wordsIn(path)) {
        const hit = banned(w.text);
        if (!hit.length) continue;
        if (markedOwnAccount(w.sf, w.node) || unreachableOnColophon(w.node)) continue;
        found.push(`${w.at} ${hit.join(", ")}: “${w.text.slice(0, 110)}”`);
      }
    }
    expect(found).toEqual([]);
  });

  it("every panel left out of the reading is drawn only where a Colophon shop can't reach it", () => {
    const stray: string[] = [];
    for (const [path, name] of Object.entries(OWN_ACCOUNT_COMPONENTS)) {
      if (!name) continue;
      let uses = 0;
      for (const other of ADMIN_FILES) {
        if (other === path || other.endsWith(`${name}.tsx`)) continue;
        const file = join(SHOP, other);
        const source = readFileSync(file, "utf8");
        if (!source.includes(`<${name}`)) continue;
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visit = (node: ts.Node) => {
          if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === name) {
            uses += 1;
            if (!unreachableOnColophon(node)) stray.push(`${other}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} draws <${name}> where a Colophon shop can reach it`);
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
      expect(uses, `${name} is drawn somewhere`).toBeGreaterThan(0);
    }
    expect(stray).toEqual([]);
  });

  it("the reader sees a stray word, a guarded one, and an allowed plain use", () => {
    const parse = (code: string) => ts.createSourceFile("x.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const strings = (sf: ts.SourceFile) => { const out: ts.Node[] = []; const v = (n: ts.Node) => { if (ts.isStringLiteral(n) && /key/.test(n.text)) out.push(n); ts.forEachChild(n, v); }; v(sf); return out; };
    const [open, guardedAnd, guardedTernary, guardedReturn, wrapped] = [
      'const a = <p title="Paste your key"/>;',
      'const a = !platformCards && <p title="Paste your key"/>;',
      'const a = platformCards ? null : <p title="Paste your key"/>;',
      'function f() { if (runsOnColophon()) return null; return <p title="Paste your key"/>; }',
      'const a = <OwnAccountOnly><p title="Paste your key"/></OwnAccountOnly>;',
    ].map((code) => strings(parse(code))[0]);
    expect(unreachableOnColophon(open)).toBe(false);
    for (const node of [guardedAnd, guardedTernary, guardedReturn, wrapped]) expect(unreachableOnColophon(node)).toBe(true);
    expect(banned("Paste your key")).toEqual(["key"]);
    expect(banned("Use the arrow keys")).toEqual([]);
    expect(banned("Use the arrow keys", [])).toEqual(["key"]);
    expect(banned("Resend email")).toEqual([]);
    expect(banned("Sent with Resend")).toEqual(["Resend"]);
    expect(banned("The webhook failed. Deploy it with your API key. DNS, CNAME, TXT, Firebase, Google Cloud, secret, Resend.").sort()).toEqual(BANNED.map((b) => b.word).sort());
  });
});

// ── 2. The messages a Colophon shop builds, read with pretend data ────────────────────────────────────────────────────

const now = Date.parse("2026-10-06T21:00:00Z");
const ago = (min: number) => new Date(now - min * 60000).toISOString();
const sentences = (items: { label?: string; title?: string; detail?: string; howTo?: string; text?: string; note?: string }[]) =>
  items.flatMap((i) => [i.label, i.title, i.detail, i.howTo, i.text, i.note]).filter((s): s is string => typeof s === "string" && s.length > 0);
const strays = (texts: string[]) => texts.filter((t) => banned(t).length).map((t) => `${banned(t).join(", ")}: “${t.slice(0, 120)}”`);

describe("the messages a Colophon shop's press is shown, built with pretend data", () => {
  it("alerts above every page: orders, payments, settings, backups, the stockroom link", () => {
    const orders = [
      { id: "M1", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(30), paymentMismatch: { ok: false } },
      { id: "R1", paymentStatus: "unpaid", reconciliationPending: true, createdAt: ago(30) },
      { id: "Q1", paymentStatus: "paid", customerRequest: { status: "open" }, createdAt: ago(300) },
      { id: "T1", paymentStatus: "paid", duplicatePayments: [{ id: "pi_2" }], createdAt: ago(300) },
      { id: "L1", paymentStatus: "paid", discountOverLimit: true, createdAt: ago(300) },
      { id: "U1", paymentStatus: "unpaid", stripePaymentIntentId: "pi_3", createdAt: ago(60) },
      { id: "D1", paymentStatus: "paid", disputeStatus: "needs_response", createdAt: ago(300) },
      { id: "F1", paymentStatus: "paid", refund: { status: "failed" }, createdAt: ago(300) },
      { id: "P1", paymentStatus: "paid", partiallyRefunded: true, createdAt: ago(300) },
      { id: "C1", paymentStatus: "unpaid", inventoryConflict: { provider: "Stripe" }, createdAt: ago(60) },
      { id: "G1", paymentStatus: "unpaid", giftCardConflict: { reason: "balance", at: ago(60) }, createdAt: ago(60) },
      { id: "O1", paymentStatus: "paid", oversold: true, createdAt: ago(60) },
      { id: "S1", paymentStatus: "paid", fulfillmentStatus: "paid", createdAt: ago(5 * 1440) },
      { id: "N1", paymentStatus: "pending", status: "pending_payment", createdAt: ago(3 * 1440) },
    ];
    const emailLog = [{ id: "e1", status: "failed", error: "The email service answered 500.", to: "reader@example.com", createdAt: ago(20) }];
    const alerts = [
      ...buildAdminAlerts(orders, { lastFailureAt: ago(60), lastReceivedAt: ago(120) }, now, emailLog),
      ...settingsAlerts({ payments: { testMode: true } }),
      ...inventoryLinkAlerts({
        startDay: "2026-10-01", connection: { ok: false }, lastRunAt: "2026-10-05T13:00:00Z", pendingImport: { count: 3, oldestSince: "2026-10-04T12:00:00Z" },
        lastPush: { failed: 2 }, linkRequestError: "x", shipmentIssues: [{ orderId: "A-1", reason: "Resolve the active return first." }],
      }, now),
      checkFailedAlert(["the payment status", "the email log"]),
      backupAlert({ ok: false, lastAttemptAt: ago(60), error: "The copy failed.", export: { ok: false, permission: true }, copy: { ok: false, error: "The copy failed." } }, now),
      cardAccountAlert({ provider: "stripe", connected: true, chargesEnabled: false, pastDue: true, needs: [{ words: "your business address", pastDue: true }] } as any),
    ].filter((a): a is NonNullable<typeof a> => !!a);
    expect(alerts.length).toBeGreaterThan(14);
    expect(strays(sentences(alerts))).toEqual([]);
  });

  it("the launch checklist, in the states a new press goes through", () => {
    const books = [{ title: "A Book", status: "published", retailPrice: 20, photos: [{ url: "u" }], description: "d" }];
    const settings = (testMode: boolean) => ({ payments: { testMode }, policies: { shipping: "x", returns: "x", privacy: "x", terms: "x" }, taxes: { rates: [{ country: "CA", rate: 13 }] }, location: { street: "1 Main St", city: "Toronto", state: "ON", country: "Canada" } });
    const emailStates = [[], [{ status: "failed", error: "The email service answered 500." }], [{ status: "sent", from: "onboarding@resend.dev" }], [{ status: "sent", from: "orders@example.com" }]];
    const accounts = [undefined, null, { provider: "stripe", connected: false }, { provider: "stripe", connected: true, chargesEnabled: false }, { provider: "stripe", connected: true, chargesEnabled: true, payoutsEnabled: true }] as any[];
    const items = [];
    for (const testMode of [true, false]) for (const emailLog of emailStates) for (const platformAccount of accounts) {
      items.push(...launchReadiness({ settings: settings(testMode), books, shippingProfiles: [{}], emailLog, orders: [{ paymentStatus: "paid" }, { paymentStatus: "paid", isTest: true }], platformCards: "stripe", platformAccount }));
    }
    items.push(...launchReadiness({ settings: { payments: {} }, books: [], shippingProfiles: [], emailLog: [], orders: [], platformCards: "square", platformAccount: null }));
    expect(items.length).toBeGreaterThan(100);
    expect(strays(sentences(items))).toEqual([]);
    // Nothing about keys, a sender's test address or a release check is asked of a press.
    const ids = new Set(items.map((i) => i.id));
    for (const gone of ["stripe-secret", "deployment", "hosting"]) expect(ids.has(gone), gone).toBe(false);
  });

  it("payment checks, the practice-order steps, order lines and email deliveries", () => {
    const checks = [{}, { testMode: true }, { manualMethods: [{ id: "m", name: "e-Transfer", enabled: true, instructions: "" }] }].flatMap((p) => paymentHealth(p, true));
    const steps = [null, { active: true }, { active: false, refusal: "shop_open" }].flatMap((practice) =>
      testSaleSteps({ payments: { testMode: true }, orders: [], webhook: null, emailLog: [], now, platform: "stripe", practice }).concat(
        testSaleSteps({ payments: {}, orders: [], now, platform: "square", practice })));
    const orderLines = [
      { paymentStatus: "unpaid", reconciliationPending: true }, { paymentStatus: "paid" }, { paymentStatus: "refunded" },
      { paymentStatus: "unpaid", paymentMismatch: { ok: false } }, { paymentStatus: "paid", disputeStatus: "needs_response" },
    ].flatMap((o) => [rowStatus(o), { text: attentionReason(o) }]);
    const deliveries = [
      { status: "sent", keySource: "settings" }, { status: "sent", keySource: "gmail" }, { status: "fallback" }, { status: "sent", sandbox: true },
      { status: "sent", attempt: 2 }, { status: "queued", retryAt: ago(-5) }, { status: "failed", error: "The email service answered 500." },
    ].flatMap((e: any) => [{ text: emailLogBadge(e).label }, { text: emailLogDetail(e) }]);
    const all = [...checks, ...steps, ...orderLines, ...deliveries];
    expect(all.length).toBeGreaterThan(30);
    expect(strays(sentences(all))).toEqual([]);
  });
});

// ── 3. What the shop's server writes to its press: owner emails, error answers, the email log's notes ──────────────────

// Server files that only a shop on its own accounts reaches (their panels are hidden on a Colophon shop, see section 1).
const OWN_ACCOUNT_SERVER_FILES: Record<string, string> = {
  "addressLookup.js": "the address finder's own key",
  "aiWriter.js": "the AI writer's own key",
  "bigQueryJourneys.js": "the analytics account link",
  "googleAnalytics.js": "the analytics account link",
  "searchConsole.js": "the search tools account link",
  "shippoEndpoints.js": "a carrier account of the press's own",
  "paypalCredentials.js": "PayPal's own credentials",
};
const SERVER_NAMES = new Set(["subject", "html", "error", "message", "note", "detail", "title", "label", "text", "body"]);

describe("the shop's server: every message a Colophon shop's press can be sent", () => {
  it("owner emails, error answers and notes carry no technical word", () => {
    const dir = join(SHOP, "functions");
    const found: string[] = [];
    let read = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && !/\.test\./.test(x) && !(x in OWN_ACCOUNT_SERVER_FILES))) {
      read += 1;
      const source = readFileSync(join(dir, f), "utf8");
      const sf = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && SERVER_NAMES.has(node.name.text)) {
          const parts: string[] = [];
          const grab = (n: ts.Node) => {
            if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) parts.push(n.text);
            ts.forEachChild(n, grab);
          };
          grab(node.initializer);
          const text = parts.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (banned(text).length && !markedOwnAccount(sf, node)) found.push(`functions/${f}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${banned(text).join(", ")}: “${text.slice(0, 110)}”`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(read).toBeGreaterThan(40);
    expect(found).toEqual([]);
  });

  it("the alert about payments the shop was never told of, and the shared sender's missing set-up, read plainly", () => {
    const require = createRequire(import.meta.url);
    const { alertHtml } = require(join(SHOP, "functions", "paymentSweep.js"));
    const html: string = alertHtml([{ orderId: "A-1", email: "reader@example.com", amount: 1250, currency: "cad", intentId: "pi_1", fixed: false }, { orderId: "A-2", amount: 900, currency: "cad", intentId: "pi_2", fixed: true }], "Stripe");
    expect(banned(visible(html))).toEqual([]);
    expect(html).toContain("A-1");
    const sender = readFileSync(join(SHOP, "functions", "email", "platformSender.js"), "utf8");
    const messages = [...sender.matchAll(/new Error\(\s*["`]([^"`]+)["`]/g)].map((m) => m[1]);
    expect(messages.some((m) => /emails aren't set up yet/.test(m))).toBe(true);
    expect(messages.filter((m) => banned(m).length)).toEqual([]);
  });
});

/** The words of an HTML email, without tags and entities. */
const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

void vi;
