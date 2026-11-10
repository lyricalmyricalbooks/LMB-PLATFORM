// The shop's own pages for the designer's preview at /design/… (design-shop.html). Studio sends the design and the
// sample products by message (features/site/previewTab.ts); this page only ever runs as that preview, so the address
// always carries ?preview=true and the shop never reads a database for its pages.
if (new URLSearchParams(location.search).get("preview") !== "true") {
  const url = new URL(location.href);
  url.searchParams.set("preview", "true");
  history.replaceState(null, "", url);
}
await import("../main");
export {};
