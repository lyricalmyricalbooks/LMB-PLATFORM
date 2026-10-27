// Runs `fn` once the page has finished loading and the browser is idle, so third-party tags (Google Analytics,
// Clarity) download after the shop's own photos and scripts instead of competing with them. Both tags queue
// their calls until their script arrives, so nothing is lost by waiting. Outside a browser it runs at once.
export function afterPageLoad(fn: () => void) {
  if (typeof document === "undefined" || typeof document.readyState !== "string") { fn(); return; }
  const idle = () => {
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
    if (ric) ric(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}
