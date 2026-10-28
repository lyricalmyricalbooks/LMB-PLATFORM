// Plan 5.8: the press's own name (Text & labels › Site name) in every server email, form and report and in the Google
// product feed, never the placeholder. Each one is rendered for a named shop whose Store name was never changed from
// the placeholder (the starting settings), and must not say the placeholder. Fakes only.
import { createRequire } from "module";
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { feedShopName, merchantFeedItems, merchantFeedXml, UNNAMED_SHOP } from "../src/app/features/site/merchantFeed.mjs";
import { llmsTxt } from "../scripts/llmsTxt.mjs";

const require = createRequire(import.meta.url);
const { pressName, DEFAULT_SHOP_NAME } = require("./shared/shopIdentity");
const { confirmationEmail, pendingRecord } = require("./newsletter");
const { buildMessageReply, handleMessageReply } = require("./messageReply");
const { customsDeclaration } = require("./customs");
const { shopOrigin } = require("./shopSettings");
const { lastWeek, weeklyHighlights } = require("./weeklySummary");
const { buildWeeklyPdf, winAnsi } = require("./weeklyPdf");
const { createEmail } = require("./email");
const { checkoutAdminActions } = require("./checkoutAdmin");
const { buildRequest } = require("./aiWriter");

const NAME = "Salt Hymns Press";
// A named shop: Site name typed in Studio, Store name still the starting placeholder.
const WEBSITE = { design: { copy: { siteName: NAME } }, info: { name: DEFAULT_SHOP_NAME }, location: { city: "Halifax" } };
const PLACEHOLDER = /your press/i;

// A Firestore stand-in keyed by "collection/id".
function fakeDb(store = {}) {
  const ref = (name, id) => ({
    id,
    async get() { const data = store[`${name}/${id}`]; return { exists: data != null, data: () => data }; },
    async set(data) { store[`${name}/${id}`] = data; },
    async create(data) { store[`${name}/${id}`] = data; },
  });
  return { store, collection: (name) => ({ doc: (id) => ref(name, id), async add() {} }), runTransaction: async (fn) => fn({ get: (r) => r.get(), update() {} }) };
}

describe("the press's own name on the server (plan 5.8)", () => {
  it("pressName reads Site name first, skips the placeholder, and keeps it only for an unnamed shop", () => {
    expect(pressName(WEBSITE)).toBe(NAME);
    expect(pressName({ info: { name: "Kestrel Books" } })).toBe("Kestrel Books");
    expect(pressName({ info: { name: DEFAULT_SHOP_NAME } }, "Moth Press")).toBe("Moth Press");
    expect(pressName({}, DEFAULT_SHOP_NAME)).toBe(DEFAULT_SHOP_NAME);
    expect(pressName(null)).toBe(DEFAULT_SHOP_NAME);
    expect(UNNAMED_SHOP).toBe(DEFAULT_SHOP_NAME);
  });

  it("the newsletter confirmation and its stored consent name the press", () => {
    const mail = confirmationEmail({ shopName: pressName(WEBSITE), confirmUrl: "https://salt.example/c", unsubscribeUrl: "https://salt.example/u", address: "Halifax" });
    expect(mail.subject).toBe(`Confirm your subscription to ${NAME}`);
    expect(mail.html).toContain(`the ${NAME} newsletter`);
    expect(`${mail.subject} ${mail.html}`).not.toMatch(PLACEHOLDER);
    const record = pendingRecord("a@example.com", "footer", "2026-10-28T00:00:00Z", pressName(WEBSITE));
    expect(record.consentText).toContain(NAME);
    expect(record.consentText).not.toMatch(PLACEHOLDER);
  });

  it("a message reply is signed with the press's name read from the shop's settings", async () => {
    const db = fakeDb({ "settings/website": WEBSITE, "contactMessages/m1": { email: "ana@example.com", name: "Ana", message: "Hi" } });
    const sent = [];
    const out = await handleMessageReply({ messageId: "m1", body: "Thanks!" }, { db, secret: "k", setupName: DEFAULT_SHOP_NAME, sendEmail: async (e) => { sent.push(e); } });
    expect(out.status).toBe(200);
    expect(sent[0].subject).toBe(`Re: your message to ${NAME}`);
    expect(sent[0].html).toContain(`— ${NAME}`);
    expect(`${sent[0].subject} ${sent[0].html}`).not.toMatch(PLACEHOLDER);
    // Settings › Email sender › Sender name, when set, signs instead.
    const db2 = fakeDb({ "settings/website": { ...WEBSITE, communications: { fromName: "The Salt desk" } }, "contactMessages/m1": { email: "ana@example.com", message: "Hi" } });
    await handleMessageReply({ messageId: "m1", body: "Thanks!" }, { db: db2, secret: "k", sendEmail: async (e) => { sent.push(e); } });
    expect(sent[1].html).toContain("— The Salt desk");
    expect(buildMessageReply({ email: "ana@example.com" }, "Hi", { shopName: NAME }).subject).toBe(`Re: your message to ${NAME}`);
  });

  it("the customs form and the label's sender are signed by the press", () => {
    const origin = shopOrigin(WEBSITE);
    expect(origin.name).toBe(NAME);
    const declaration = customsDeclaration(["item1"], { orderId: "A-1" }, origin.name, "CA");
    expect(declaration.certify_signer).toBe(NAME);
    expect(JSON.stringify(declaration)).not.toMatch(PLACEHOLDER);
  });

  it("the weekly report's PDF is headed with the press's name", () => {
    const week = lastWeek(Date.parse("2026-10-19T12:00:00Z"));
    const pdf = buildWeeklyPdf(weeklyHighlights({ orders: [], daily: [], week }), { shopName: NAME });
    const raw = pdf.toString("latin1");
    const streams = [];
    const re = /(?<!end)stream\n/g;
    let m;
    while ((m = re.exec(raw))) {
      const start = m.index + m[0].length;
      streams.push(zlib.inflateSync(pdf.subarray(start, raw.indexOf("\nendstream", start))).toString("latin1"));
    }
    const hex = (s) => `<${winAnsi(s).map((b) => b.toString(16).padStart(2, "0")).join("")}>`;
    const everything = raw + streams.join("\n");
    expect(everything).toContain(hex(NAME.toUpperCase()));
    expect(raw).toContain(`/Producer ${hex(NAME)}`);
    for (const placeholder of ["Your Press", "YOUR PRESS", "(Your Press)"]) {
      expect(everything).not.toContain(hex(placeholder));
      expect(everything).not.toContain(placeholder);
    }
  });

  it("every email leaves from the press's name and carries it in the email's frame", async () => {
    const db = fakeDb({ "settings/website": WEBSITE });
    const sent = [];
    class Resend { constructor() { this.emails = { send: async (message) => { sent.push(message); return { data: { id: "re-1" }, error: null }; } }; } }
    const mail = createEmail({
      db, crypto: require("crypto"), Resend, nodemailer: { createTransport: () => ({}) }, ownerEmail: "owner@example.com",
      senderName: DEFAULT_SHOP_NAME, senderEmail: "orders@example.com", readAdminSecret: async () => ({}),
      resendSecretValue: () => "re_test", escapeHtml: (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    });
    await mail.send({ to: "reader@example.com", subject: "Your order", html: "<p>Thanks</p>" });
    expect(sent[0].from).toBe(`${NAME} <orders@example.com>`);
    expect(sent[0].html).toContain(NAME);
    expect(`${sent[0].from} ${sent[0].html}`).not.toMatch(PLACEHOLDER);
  });

  it("a gift card issued from the admin is from the press, and the payment events address is labelled with it", async () => {
    const db = fakeDb({ "settings/website": WEBSITE });
    const emailed = [];
    const created = [];
    const actions = checkoutAdminActions({
      db, requireAdmin: async () => ({ email: "owner@example.com" }), readBody: (req) => req.body, GIFT_CARD_BODIES: { issue: {} },
      giftCardId: (code) => `id-${code}`, last4: (code) => code.slice(-4), newGiftCardCode: () => "ABCD-EFGH-JKMN-PQRS",
      emailGiftCard: async (id, card) => { emailed.push(card); }, withHistory: () => [],
      STRIPE_WEBHOOK_URL: "https://example.com/hook", REQUIRED_WEBHOOK_EVENTS: ["checkout.session.completed"],
      webhookEndpointReport: (list) => ({ found: list.length > 0 }),
      payments: { webhookEndpoints: async () => ({ mode: "test", endpoints: { list: async () => ({ data: [] }), create: async (e) => { created.push(e); return { id: "we_1", secret: "whsec_1" }; } } }) },
    });
    const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
    const r1 = res();
    await actions.handleGiftCardAdmin({ body: { op: "issue", amountMinor: 2500, recipientEmail: "sam@example.com", sendEmail: true } }, r1);
    expect(r1.code).toBe(200);
    expect(emailed[0].senderName).toBe(NAME);
    const r2 = res();
    await actions.handleWebhookHealth({ body: { fix: true } }, r2);
    expect(created[0].description).toBe(`${NAME} shop orders (created by Admin › Payments)`);
  });

  it("the AI writing assistant writes for the press by name", () => {
    const body = buildRequest("bookSeo", { title: "Salt" }, { siteName: NAME }, "gemini-2.5-flash");
    expect(body.systemInstruction.parts[0].text).toContain(`You write shop copy for ${NAME}`);
    expect(JSON.stringify(body)).not.toMatch(PLACEHOLDER);
  });

  it("the Google product feed and llms.txt use the press's name", () => {
    const settings = { ...WEBSITE, design: { ...WEBSITE.design } };
    const shopName = feedShopName(settings);
    expect(shopName).toBe(NAME);
    const book = { id: "b1", title: "Salt", description: "Sea poems.", retailPrice: 30, trackInventory: true, stockLevel: 3, photos: [{ url: "https://img.example/salt.jpg" }] };
    const feed = merchantFeedItems("https://salt.example", [book], { shopName });
    const xml = merchantFeedXml("https://salt.example", feed.items, { shopName });
    expect(xml).toContain(`<title>${NAME}</title>`);
    expect(xml).toContain(`<description>${NAME} books</description>`);
    expect(feed.items).toHaveLength(1);
    expect(xml).toContain(`<g:brand>${NAME}</g:brand>`);
    expect(xml).not.toMatch(PLACEHOLDER);
    const text = llmsTxt("https://salt.example/", [book], [], settings, { shopName });
    expect(text.startsWith(`# ${NAME}\n`)).toBe(true);
    expect(text).not.toMatch(PLACEHOLDER);
    // Without a name passed in, llms.txt still finds it.
    expect(llmsTxt("https://salt.example/", [], [], settings).startsWith(`# ${NAME}\n`)).toBe(true);
    // A shop with no name at all keeps the placeholder.
    expect(feedShopName({ info: { name: "" } })).toBe(UNNAMED_SHOP);
  });
});
