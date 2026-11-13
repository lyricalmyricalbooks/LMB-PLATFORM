// "Download your shop": reads the shop through the admin's own reads (this shop only), builds the zip in the browser and
// hands it over. Nothing is sent anywhere; the only record is one line in the shop's own activity log.
import { adminApi } from "./api";
import { customersForAnotherShop } from "./shopExport";
import { optedOutBy } from "./shopMove";
import { emailHash } from "./Customers";
import { shopNameFromSettings } from "../features/site/shopIdentity";
import { photoPlan, takeoutFiles } from "./shopTakeout";
import { fetchPhotos } from "./takeoutPhotos";
import { saveFile, zipStored } from "./xlsxWriter";
import { combinedAdmin } from "./combined";
import { WHOLE_SHOP, choiceWords, isWhole, ordersInRange, pickFiles, type TakeoutChoice } from "./takeoutChoice";

/** Plan 7.18: "yes" to email marketing only for people on the newsletter now (not opted out); the owner's notes and tags. */
async function peopleFor(orders: any[]) {
  const [news, notes] = await Promise.all([adminApi.getMarketingConsent(), adminApi.listCustomerNotes().catch(() => [])]);
  const emails = new Set<string>([...news.subscribed, ...orders.map((o: any) => String(o.customer?.email || "").trim().toLowerCase()).filter(Boolean)]);
  const hashes = new Map(await Promise.all([...emails].map(async (e) => [e, await emailHash(e)] as const)));
  return {
    consent: { subscribed: news.subscribed, optedOut: optedOutBy(news.optedOutHashes, (email: string) => hashes.get(email)) },
    notes: new Map(notes.filter((n) => n.email).map((n) => [String(n.email).trim().toLowerCase(), { note: n.note || "", tags: n.tags || [] }])),
  };
}

export async function customerFileFor(orders: any[]): Promise<string> {
  const { consent, notes } = await peopleFor(orders);
  return customersForAnotherShop(orders, consent, notes);
}

export type TakeoutStep = { label: string; done?: number; of?: number };

/** Reads the shop and makes every file of the download. Both doors (the zip and the folder backup) use this. */
export async function buildTakeout(onStep: (step: TakeoutStep) => void = () => {}, choice: TakeoutChoice = WHOLE_SHOP) {
  const want = (part: TakeoutChoice["parts"][number]) => choice.parts.includes(part);
  onStep({ label: "Reading your shop…" });
  const [books, allOrders, settings, pages] = await Promise.all([
    adminApi.getAllBooks(), adminApi.getAllOrders(), adminApi.getPublicSettings().catch(() => null), adminApi.getPages().catch(() => []),
  ]);
  const realOrders = allOrders.filter((o: any) => o.isTest !== true);
  const orders = ordersInRange(realOrders, choice.from, choice.to);
  const { consent, notes: noteMap } = await peopleFor(realOrders);
  const plan = photoPlan(books);
  const saved = want("photos") ? await fetchPhotos(plan, { onProgress: (done, of) => onStep({ label: "Copying photos…", done, of }) }) : new Map();
  const pressName = shopNameFromSettings(settings) || "Your shop";
  const all = takeoutFiles({ pressName, books, orders, consent, notes: noteMap, pages, settings: stripPrivate(settings), photos: { plan, saved } });
  // A date range narrows the orders file only: the customers file still lists the people of every order.
  if (orders !== realOrders) {
    const i = all.findIndex((f) => f.path === "customers/customers.csv");
    if (i >= 0) all[i] = { path: all[i].path, content: customersForAnotherShop(realOrders, consent, noteMap) };
  }
  const files = pickFiles(all, choice);
  // The combined admin's stockroom records go in too, as one file in the stockroom's own copy shape (best effort: a team
  // member can't read them, and the rest of the download still matters).
  if (combinedAdmin() && want("stockroom")) {
    const stockroom = await import("./stockroom/stockroomCopies").then((m) => m.copiesIO.whole().then((w) => m.snapshotOf(w))).catch(() => null);
    if (stockroom) files.push({ path: "stockroom/stockroom.json", content: JSON.stringify(stockroom, null, 2) });
  }
  const bits = [want("products") && `${books.length} products`, want("orders") && `${orders.length} orders`, want("customers") && "customers",
    want("photos") && (saved.size < plan.length ? `${saved.size} of ${plan.length} photos` : `${saved.size} photos`)].filter(Boolean) as string[];
  const summary = bits.join(", ") || choiceWords(choice);
  return { files, pressName, summary, detail: isWhole(choice) && choice.format === "csv" ? `${books.length} products, ${orders.length} orders, ${saved.size} of ${plan.length} photos` : `${choiceWords(choice)}: ${summary}` };
}

/** Builds the zip and saves it. Resolves with a short summary line for the toast. */
export async function downloadShop(onStep: (step: TakeoutStep) => void = () => {}, choice: TakeoutChoice = WHOLE_SHOP): Promise<string> {
  const { files, pressName, summary, detail } = await buildTakeout(onStep, choice);
  const whole = isWhole(choice) && choice.format === "csv";
  onStep({ label: "Packing the download…" });
  const zip = zipStored(files.map((f) => [f.path, typeof f.content === "string" ? new TextEncoder().encode(f.content) : f.content]));
  const day = new Date().toISOString().slice(0, 10);
  saveFile(`${(pressName || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop"}-${day}.zip`, zip, "application/zip");
  await adminApi.recordAuditLog("export", whole ? `Downloaded the whole shop: ${detail}` : `Downloaded part of the shop: ${detail}`).catch(() => {});
  return summary;
}

const PRIVATE = /secret|password|passcode|token|privatekey|apikey|accesskey|signingkey/i;
function stripPrivate(value: any): any {
  if (Array.isArray(value)) return value.map(stripPrivate);
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).filter(([k]) => !PRIVATE.test(k)).map(([k, v]) => [k, stripPrivate(v)]));
  return value;
}
