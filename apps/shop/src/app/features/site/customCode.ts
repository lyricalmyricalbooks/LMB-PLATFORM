// Studio › Style › Custom code (advanced): "Extra <head> HTML" and "Footer scripts".
// Injected on the public storefront only — never in the Studio preview iframe, the admin, or checkout
// (so a bad snippet can't break the editor or payments). Idempotent: many components call useSiteData,
// so identical calls do nothing. Scripts are re-created (innerHTML scripts don't run) and tagged so a
// changed or removed snippet clears its old tags. A script that already ran can't be un-run until reload.

const ATTR = "data-fm-custom-code";
let applied = "";

const isPreview = () => new URLSearchParams(window.location.search).get("preview") === "true";
const isBlockedRoute = (pathname: string) => /\/(checkout|admin)(\/|$)/.test(pathname);

function insert(html: string, parent: HTMLElement) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    let out: HTMLElement = el.cloneNode(true) as HTMLElement;
    if (el.tagName === "SCRIPT") {
      const script = document.createElement("script");
      for (const a of Array.from(el.attributes)) script.setAttribute(a.name, a.value);
      script.text = el.textContent || "";
      out = script;
    }
    out.setAttribute(ATTR, "");
    parent.appendChild(out);
  });
}

export function applyCustomCode(design: any, pathname: string) {
  if (typeof document === "undefined") return;
  const head = String(design?.customHeadHtml || "").trim();
  const footer = String(design?.customFooterScripts || "").trim();
  const enabled = !isPreview() && !isBlockedRoute(pathname) && Boolean(head || footer);
  const key = enabled ? JSON.stringify([head, footer]) : "";
  if (key === applied) return;
  applied = key;
  document.querySelectorAll(`[${ATTR}]`).forEach((n) => n.remove());
  if (!enabled) return;
  try {
    if (head) insert(head, document.head);
    if (footer) insert(footer, document.body);
  } catch { /* a broken snippet must never break the storefront */ }
}
