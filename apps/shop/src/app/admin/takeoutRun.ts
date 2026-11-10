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

/** Builds the zip and saves it. Resolves with a short summary line for the toast. */
export async function downloadShop(onStep: (step: TakeoutStep) => void = () => {}): Promise<string> {
  onStep({ label: "Reading your shop…" });
  const [books, allOrders, settings, pages] = await Promise.all([
    adminApi.getAllBooks(), adminApi.getAllOrders(), adminApi.getPublicSettings().catch(() => null), adminApi.getPages().catch(() => []),
  ]);
  const orders = allOrders.filter((o: any) => o.isTest !== true);
  const { consent, notes: noteMap } = await peopleFor(orders);
  const plan = photoPlan(books);
  const saved = await fetchPhotos(plan, { onProgress: (done, of) => onStep({ label: "Copying photos…", done, of }) });
  onStep({ label: "Packing the download…" });
  const pressName = shopNameFromSettings(settings) || "Your shop";
  const files = takeoutFiles({ pressName, books, orders, consent, notes: noteMap, pages, settings: stripPrivate(settings), photos: { plan, saved } });
  const zip = zipStored(files.map((f) => [f.path, typeof f.content === "string" ? new TextEncoder().encode(f.content) : f.content]));
  const day = new Date().toISOString().slice(0, 10);
  saveFile(`${(pressName || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop"}-${day}.zip`, zip, "application/zip");
  await adminApi.recordAuditLog("export", `Downloaded the whole shop: ${books.length} products, ${orders.length} orders, ${saved.size} of ${plan.length} photos`).catch(() => {});
  return `${books.length} products, ${orders.length} orders${saved.size < plan.length ? `, ${saved.size} of ${plan.length} photos` : ""}`;
}

const PRIVATE = /secret|password|passcode|token|privatekey|apikey|accesskey|signingkey/i;
function stripPrivate(value: any): any {
  if (Array.isArray(value)) return value.map(stripPrivate);
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).filter(([k]) => !PRIVATE.test(k)).map(([k, v]) => [k, stripPrivate(v)]));
  return value;
}
