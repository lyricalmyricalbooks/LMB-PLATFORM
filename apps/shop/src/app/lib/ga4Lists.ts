// Google Analytics "lists": which book cards shoppers saw (`view_item_list`) and which one they opened (`select_item`),
// for every book list on the shop (shop grid, sections, related books, recently viewed, wishlist, search results).
// Cards aren't wired one by one: every book card already carries `.fm-card-title` (cardClasses.test.tsx), and the
// list it sits in names itself with `data-ga-list`. Book ids come from the shop data this tab already has
// (session cache), so Google's item reports join these with view_item / add_to_cart, which send the same id and title.
// Nothing here runs unless Google Analytics is configured (`startListTracking` is called by configureGa4), and every
// event still goes through ga4Event's consent, owner, preview and admin-page checks.
import { readSiteCache } from "../features/site/siteCache";
import { ga4Event, isUntrackedPath, type Ga4ListItem } from "./ga4";

const TITLE = ".fm-card-title";
const CARD = ".fm-card, a[href], [role='option']";
const MAX_ITEMS_PER_EVENT = 50;
const FLUSH_MS = 2000;

/** The list a card sits in: its `data-ga-list`, else "Shop". */
export function listNameOf(el: Element | null): string {
  const named = el?.closest("[data-ga-list]")?.getAttribute("data-ga-list")?.trim();
  return (named || "Shop").slice(0, 100);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Title → book id from the shop data this tab already read (exact title, then case-insensitive). */
export function bookIdForTitle(title: string, books: Array<{ id?: unknown; title?: unknown }> | null | undefined): string {
  if (!title || !Array.isArray(books)) return "";
  const exact = books.find(b => clean(String(b?.title ?? "")) === title);
  const hit = exact || books.find(b => clean(String(b?.title ?? "")).toLowerCase() === title.toLowerCase());
  return hit?.id ? String(hit.id) : "";
}

/** The GA item for a card title element (null for an empty title). */
export function itemForTitle(titleEl: Element, books?: Array<{ id?: unknown; title?: unknown }> | null): Ga4ListItem | null {
  const name = clean(titleEl.textContent || "").slice(0, 100);
  if (!name) return null;
  const id = bookIdForTitle(name, books ?? readSiteCache()?.books);
  return { item_name: name, ...(id ? { item_id: id } : {}) };
}

/** The card's title element for a click, or null when the click wasn't on a book card (or was on a button inside it). */
export function clickedCardTitle(target: Element | null): Element | null {
  if (!target) return null;
  const card = target.closest(CARD);
  if (!card) return null;
  const title = card.matches(TITLE) ? card : card.querySelector(TITLE);
  if (!title) return null;
  // Add to bag / wishlist / quick-add buttons inside a card aren't "opened the book".
  const control = target.closest("button, input, select, textarea, [role='button']");
  if (control && control !== card && card.contains(control)) return null;
  return title;
}

let started = false;
let seen = new Set<string>();
let seenPath = "";
let pending = new Map<string, Ga4ListItem[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flushViews() {
  timer = null;
  const lists = pending;
  pending = new Map();
  lists.forEach((items, list) => {
    for (let i = 0; i < items.length; i += MAX_ITEMS_PER_EVENT) {
      ga4Event("view_item_list", { item_list_name: list, items: items.slice(i, i + MAX_ITEMS_PER_EVENT) });
    }
  });
}

function noteSeen(titleEl: Element) {
  if (isUntrackedPath(window.location.pathname)) return;
  if (seenPath !== window.location.pathname) { seenPath = window.location.pathname; seen = new Set(); }
  const item = itemForTitle(titleEl);
  if (!item) return;
  const list = listNameOf(titleEl);
  const key = `${list}\u0000${item.item_name}`;
  if (seen.has(key)) return;
  seen.add(key);
  const items = pending.get(list) || [];
  items.push({ ...item, item_list_name: list, index: items.length });
  pending.set(list, items);
  if (!timer) timer = setTimeout(flushViews, FLUSH_MS);
}

/** Starts watching book cards once Google Analytics is configured (idempotent; no-op outside a browser). */
export function startListTracking(): void {
  if (started || typeof window === "undefined" || typeof document === "undefined") return;
  started = true;

  document.addEventListener("click", e => {
    if (isUntrackedPath(window.location.pathname)) return;
    const title = clickedCardTitle(e.target instanceof Element ? e.target : null);
    if (!title) return;
    const item = itemForTitle(title);
    if (!item) return;
    const list = listNameOf(title);
    ga4Event("select_item", { item_list_name: list, items: [{ ...item, item_list_name: list }] });
  }, true);

  // Views need IntersectionObserver; very old browsers only report clicks.
  if (typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;
  const watched = new WeakSet<Element>();
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      noteSeen(entry.target);
    }
  }, { threshold: 0.5 });
  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    if (isUntrackedPath(window.location.pathname)) return;
    document.querySelectorAll(TITLE).forEach(el => {
      if (watched.has(el)) return;
      watched.add(el);
      io.observe(el);
    });
  };
  const queueScan = () => { if (!scanQueued) { scanQueued = true; setTimeout(scan, 500); } };
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  queueScan();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && timer) { clearTimeout(timer); flushViews(); } });
}

/** Test hook. */
export function __resetGa4ListsForTests() { started = false; seen = new Set(); seenPath = ""; pending = new Map(); if (timer) clearTimeout(timer); timer = null; }
