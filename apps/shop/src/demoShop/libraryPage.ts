// Draws the starter library (starterLibrary.ts): /demo/starters/ lists every offered starter with filters, and
// /demo/starters/<id> shows one at desktop and phone size, live, in each of its styles. Plain DOM in the Colophon look
// (cream page, black pills, mint for the way in), so the page stays light and needs none of the shop's code until a
// live preview opens the sample shop in a frame.
import { filterEntries, LIBRARY_FILTERS, libraryEntries, liveHref, readOfferedChoice, joinHref, type LibraryEntry } from "./starterLibrary";
import { goodFor, strengthsOf } from "../app/admin/studio/starterStrengths";

const BASE = import.meta.env.BASE_URL;

const CSS = `
:root{--cl-cream:#f6f1e7;--cl-paper:#fffdf8;--cl-ink:#111;--cl-muted:#55524b;--cl-line:#e3dccd;--cl-mint:#a9e8c6;--cl-mint-ink:#0f3d28}
*{box-sizing:border-box}
body{margin:0;background:var(--cl-cream);color:var(--cl-ink);font:400 16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.sl-wrap{max-width:1240px;margin:0 auto;padding:0 32px}
.sl-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:22px;padding-bottom:22px}
.sl-brand{font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none}
.sl-pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:999px;border:1.5px solid var(--cl-ink);background:var(--cl-ink);color:var(--cl-cream);font:600 15px/1 inherit;text-decoration:none;cursor:pointer;white-space:nowrap}
.sl-pill.sl-ghost{background:transparent;color:var(--cl-ink)}
.sl-pill.sl-mint{background:var(--cl-mint);border-color:var(--cl-mint);color:var(--cl-ink)}
.sl-pill:focus-visible,.sl-filter:focus-visible,.sl-style:focus-visible,.sl-card a:focus-visible{outline:3px solid var(--cl-mint-ink);outline-offset:3px}
.sl-hero{padding:56px 0 28px}
.sl-eyebrow{margin:0 0 14px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--cl-muted)}
.sl-hero h1{margin:0;max-width:16ch;font-size:clamp(40px,6vw,76px);line-height:1;letter-spacing:-.035em;font-weight:700}
.sl-lede{margin:20px 0 0;max-width:56ch;font-size:19px;color:var(--cl-muted)}
.sl-filters{display:flex;flex-wrap:wrap;gap:10px;margin:36px 0 8px}
.sl-filter{min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--cl-line);background:var(--cl-paper);font:500 15px/1 inherit;color:var(--cl-ink);cursor:pointer}
.sl-filter[aria-pressed="true"]{background:var(--cl-ink);border-color:var(--cl-ink);color:var(--cl-cream)}
.sl-count{margin:8px 0 24px;color:var(--cl-muted);font-size:15px}
.sl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding-bottom:88px}
.sl-card{display:flex;flex-direction:column;background:var(--cl-paper);border:1.5px solid var(--cl-line);border-radius:24px;overflow:hidden}
.sl-cover{position:relative;display:block;aspect-ratio:4/3;background:var(--cl-line);overflow:hidden}
.sl-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
.sl-card:hover .sl-cover img{transform:scale(1.03)}
.sl-body{display:flex;flex-direction:column;gap:12px;flex:1;padding:22px 22px 24px}
.sl-body h2{margin:0;font-size:26px;line-height:1.1;letter-spacing:-.02em}
.sl-body h2 a{text-decoration:none}
.sl-mood{margin:0;color:var(--cl-muted);font-size:15px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.sl-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.sl-chips li{padding:5px 11px;border-radius:999px;background:var(--cl-cream);font-size:13px;font-weight:500}
.sl-swatches{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:6px;color:var(--cl-muted);font-size:13px}
.sl-dots{display:inline-flex}
.sl-dots i{width:20px;height:20px;border-radius:50%;border:2px solid var(--cl-paper);margin-left:-6px;box-shadow:0 0 0 1px var(--cl-line)}
.sl-dots i:first-child{margin-left:0}
.sl-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.sl-empty{padding:48px;border-radius:24px;background:var(--cl-paper);border:1.5px dashed var(--cl-line);text-align:center;color:var(--cl-muted)}
.sl-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-weight:500;text-decoration:none;color:var(--cl-muted)}
.sl-detail{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:56px;align-items:start;padding:24px 0 96px}
.sl-detail h1{margin:6px 0 0;font-size:clamp(44px,5vw,68px);line-height:1;letter-spacing:-.035em}
.sl-detail .sl-mood{-webkit-line-clamp:unset;font-size:17px;margin-top:16px}
.sl-size{margin:2px 0 0;font-size:14px;font-weight:600;color:var(--cl-ink)}
.sl-detail .sl-size{margin-top:14px}
.sl-strengths{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.sl-strengths li{position:relative;padding-left:22px;font-size:15px;line-height:1.45}
.sl-strengths li::before{content:"";position:absolute;left:2px;top:.5em;width:8px;height:8px;border-radius:50%;background:var(--cl-mint-ink)}
.sl-label{margin:28px 0 10px;font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--cl-muted)}
.sl-styles{display:grid;gap:8px}
.sl-style{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 14px;border-radius:16px;border:1.5px solid var(--cl-line);background:var(--cl-paper);font:500 15px/1.2 inherit;color:var(--cl-ink);cursor:pointer;text-align:left}
.sl-style[aria-pressed="true"]{border-color:var(--cl-ink);box-shadow:inset 0 0 0 1px var(--cl-ink)}
.sl-style small{margin-left:auto;color:var(--cl-muted);font-size:13px}
.sl-detail .sl-actions{margin-top:28px}
.sl-detail .sl-chips li{background:var(--cl-paper);border:1px solid var(--cl-line)}
.sl-stage{position:relative;padding-bottom:40px}
.sl-browser{border-radius:18px;background:var(--cl-paper);border:1.5px solid var(--cl-line);overflow:hidden;box-shadow:0 30px 60px -30px rgba(17,17,17,.35)}
.sl-chrome{display:flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-bottom:1.5px solid var(--cl-line)}
.sl-chrome i{width:10px;height:10px;border-radius:50%;background:var(--cl-line)}
.sl-screen{position:relative;width:100%;aspect-ratio:1440/900;overflow:hidden;background:var(--cl-cream)}
.sl-screen iframe,.sl-phone-screen iframe{position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#fff}
.sl-phone{position:absolute;right:-12px;bottom:0;width:168px;padding:8px;border-radius:30px;background:var(--cl-ink);box-shadow:0 24px 50px -20px rgba(17,17,17,.5)}
.sl-phone-screen{position:relative;width:100%;aspect-ratio:390/780;border-radius:23px;overflow:hidden;background:#fff}
.sl-note{margin:14px 0 0;color:var(--cl-muted);font-size:14px}
@media (max-width:1023px){.sl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sl-detail{grid-template-columns:1fr;gap:36px}.sl-phone{right:8px}}
@media (max-width:639px){.sl-wrap{padding:0 16px}.sl-hero{padding:32px 0 16px}.sl-lede{font-size:17px}.sl-grid{grid-template-columns:1fr;gap:18px}.sl-top .sl-ghost{display:none}.sl-phone{width:118px;border-radius:22px;padding:6px}.sl-phone-screen{border-radius:17px}.sl-actions .sl-pill{flex:1}}
@media (prefers-reduced-motion:reduce){.sl-cover img{transition:none}}
`;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const kid of kids) if (kid !== null && kid !== false) node.append(kid);
  return node;
}

const starterHref = (id: string, style?: string) => `${BASE}starters/${id}${style ? `?style=${encodeURIComponent(style)}` : ""}`;

function topBar() {
  return h("header", { className: "sl-wrap sl-top" },
    h("a", { className: "sl-brand", href: "/", text: "Colophon" }),
    h("nav", { "aria-label": "Starters", className: "sl-actions", style: "margin:0" },
      h("a", { className: "sl-pill sl-ghost", href: `${BASE}starters/`, text: "All starters" }),
      h("a", { className: "sl-pill", href: "/join/", text: "Start free" })));
}

const dots = (swatches: string[]) => h("span", { className: "sl-dots", "aria-hidden": "true" }, ...swatches.map((c) => h("i", { style: `background:${c}` })));

function card(entry: LibraryEntry) {
  const own = entry.styles[0]?.id || "";
  return h("article", { className: "sl-card" },
    h("a", { className: "sl-cover", href: starterHref(entry.id), tabindex: "-1", "aria-hidden": "true" },
      entry.cover ? h("img", { src: entry.cover, alt: "", loading: "lazy", decoding: "async" }) : null),
    h("div", { className: "sl-body" },
      h("h2", {}, h("a", { href: starterHref(entry.id), text: entry.name })),
      h("p", { className: "sl-mood", text: entry.mood }),
      goodFor(entry.id) ? h("p", { className: "sl-size", text: goodFor(entry.id) }) : null,
      h("ul", { className: "sl-chips", "aria-label": "Best for" }, ...entry.bestFor.map((b) => h("li", { text: b }))),
      h("div", { className: "sl-swatches" }, ...entry.styles.map((s) => dots(s.swatches)).slice(0, 3),
        h("span", { text: `${entry.styles.length} styles` })),
      h("div", { className: "sl-actions" },
        h("a", { className: "sl-pill", href: starterHref(entry.id), text: "Look closer" }),
        h("a", { className: "sl-pill sl-ghost", href: liveHref(entry, own, BASE), text: "See it live" }))));
}

function libraryView(root: HTMLElement, entries: LibraryEntry[], filter = new URLSearchParams(location.search).get("for") || "all") {
  const shown = filterEntries(entries, filter);
  const filters = h("div", { className: "sl-filters", role: "group", "aria-label": "Show starters for" },
    ...LIBRARY_FILTERS.map((f) => h("button", {
      type: "button", className: "sl-filter", "aria-pressed": String(f.id === filter), text: f.label,
      onclick: () => {
        const url = new URL(location.href);
        if (f.id === "all") url.searchParams.delete("for"); else url.searchParams.set("for", f.id);
        history.replaceState(null, "", url);
        libraryView(root, entries, f.id);
        (root.querySelector(`.sl-filter[aria-pressed="true"]`) as HTMLElement | null)?.focus();
      },
    })));
  root.replaceChildren(topBar(), h("main", { className: "sl-wrap" },
    h("section", { className: "sl-hero" },
      h("p", { className: "sl-eyebrow", text: "Starter websites" }),
      h("h1", { text: "Start from a whole shop, then make it yours." }),
      h("p", { className: "sl-lede", text: "Each starter is a finished sample shop with its own photos, pages and three colour styles. Pick one and change every word, colour and section." }),
      filters,
      h("p", { className: "sl-count", role: "status", text: `${shown.length} ${shown.length === 1 ? "starter" : "starters"}` })),
    shown.length
      ? h("div", { className: "sl-grid" }, ...shown.map(card))
      : h("div", { className: "sl-empty", text: "No starters for this yet. Try All starters." })));
  document.title = "Starter websites · Colophon";
}

function frame(src: string, width: number, height: number, title: string) {
  return h("iframe", { src, title, width: String(width), height: String(height), loading: "lazy", tabindex: "-1" });
}

/** Scales each live preview to fit its box. */
function fit(root: HTMLElement) {
  for (const box of root.querySelectorAll<HTMLElement>(".sl-screen, .sl-phone-screen")) {
    const f = box.querySelector("iframe");
    if (f) f.style.transform = `scale(${box.clientWidth / Number(f.getAttribute("width"))})`;
  }
}

function starterView(root: HTMLElement, entries: LibraryEntry[], id: string) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) { libraryView(root, entries); return; }
  const asked = new URLSearchParams(location.search).get("style");
  let style = entry.styles.find((s) => s.id === asked)?.id || entry.styles[0]?.id || "";
  const live = () => `${liveHref(entry, style, BASE)}&frame=1`;
  const desk = h("div", { className: "sl-screen" }, frame(live(), 1440, 900, `${entry.name} on a computer`));
  const phone = h("div", { className: "sl-phone-screen" }, frame(live(), 390, 780, `${entry.name} on a phone`));
  const see = h("a", { className: "sl-pill sl-ghost", href: liveHref(entry, style, BASE), text: "See it live" });
  const use = h("a", { className: "sl-pill sl-mint", href: joinHref(entry, style), "data-use-starter": entry.id, text: "Use this starter" });
  const picker = h("div", { className: "sl-styles", role: "group", "aria-label": "Styles" },
    ...entry.styles.map((s, i) => h("button", {
      type: "button", className: "sl-style", "aria-pressed": String(s.id === style),
      onclick: (e: Event) => {
        style = s.id;
        for (const b of picker.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        for (const f of root.querySelectorAll("iframe")) f.src = live();
        see.href = liveHref(entry, style, BASE);
        use.href = joinHref(entry, style);
        const url = new URL(location.href); url.searchParams.set("style", style); history.replaceState(null, "", url);
      },
    }, dots(s.swatches), h("span", { text: s.name }), i === 0 ? h("small", { text: "Its own" }) : null)));
  root.replaceChildren(topBar(), h("main", { className: "sl-wrap" },
    h("a", { className: "sl-back", href: `${BASE}starters/`, text: "← All starters" }),
    h("div", { className: "sl-detail" },
      h("section", {},
        h("p", { className: "sl-eyebrow", text: "Starter website" }),
        h("h1", { text: entry.name }),
        h("p", { className: "sl-mood", text: entry.mood }),
        h("p", { className: "sl-label", text: "Best for" }),
        h("ul", { className: "sl-chips" }, ...entry.bestFor.map((b) => h("li", { text: b }))),
        goodFor(entry.id) ? h("p", { className: "sl-size", text: goodFor(entry.id) }) : null,
        strengthsOf(entry.id).length ? h("p", { className: "sl-label", text: "What it does well" }) : null,
        strengthsOf(entry.id).length ? h("ul", { className: "sl-strengths" }, ...strengthsOf(entry.id).map((b) => h("li", { text: b }))) : null,
        h("p", { className: "sl-label", text: "Styles" }),
        picker,
        h("div", { className: "sl-actions" }, use, see),
        h("p", { className: "sl-note", text: "Free for 14 days, no card needed. Every word, colour and section can be changed later." })),
      h("section", { className: "sl-stage", "aria-label": "Live preview" },
        h("div", { className: "sl-browser" }, h("div", { className: "sl-chrome", "aria-hidden": "true" }, h("i"), h("i"), h("i")), desk),
        h("div", { className: "sl-phone" }, phone)))));
  document.title = `${entry.name} · Starter websites · Colophon`;
  fit(root);
}

export async function showLibrary(route: { page: "library" } | { page: "starter"; id: string }) {
  document.head.append(h("style", { text: CSS }));
  const root = document.getElementById("root")!;
  root.replaceChildren(h("p", { className: "sl-wrap", style: "padding-top:40px;color:#55524b", text: "Opening the starters…" }));
  const entries = libraryEntries(await readOfferedChoice(), BASE);
  if (route.page === "starter") starterView(root, entries, route.id); else libraryView(root, entries);
  addEventListener("resize", () => fit(root));
}
