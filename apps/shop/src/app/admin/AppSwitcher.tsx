import { useEffect, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { INVENTORY_APP_URL, WEBSITE_TAB_NAME, inventoryOrderUrl, openInventoryApp, useInventoryWaiting } from "./appSwitch";

const waitingWords = (n: number) => `${n} website ${n === 1 ? "order is" : "orders are"} waiting for the inventory app`;

/** Names this tab so the inventory app's switcher comes back to it instead of opening another. */
export function useWebsiteTabName() {
  useEffect(() => {
    const before = window.name;
    window.name = WEBSITE_TAB_NAME;
    return () => { if (window.name === WEBSITE_TAB_NAME) window.name = before; };
  }, []);
}

function follow(e: MouseEvent<HTMLAnchorElement>, url: string) {
  // Ctrl/⌘/middle clicks keep the browser's own new-tab behaviour.
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (openInventoryApp(window, url)) e.preventDefault();
}

/**
 * "Website · Inventory" at the top of the rail (and of the phone drawer). Website is where you are; Inventory opens
 * the inventory app, bringing its tab forward when it's already open, with the orders waiting for it.
 */
export function AppSwitcher({ onSwitch }: { onSwitch?: () => void }) {
  const waiting = useInventoryWaiting();
  return (
    <div className="rp-app-switch" role="group" aria-label="Switch app">
      <span className="rp-app-switch-seg" aria-current="page">Website</span>
      <a className="rp-app-switch-seg" href={INVENTORY_APP_URL} target="_blank" rel="noopener"
        aria-label={waiting ? `Open the inventory app. ${waitingWords(waiting)}` : "Open the inventory app"}
        title={waiting ? waitingWords(waiting) : "Open the inventory app"}
        onClick={(e) => { follow(e, INVENTORY_APP_URL); onSwitch?.(); }}>
        Inventory
        <ArrowUpRight size={14} aria-hidden className="rp-app-switch-go" />
        {!!waiting && <span className="rp-app-switch-badge" aria-hidden>{waiting > 99 ? "99+" : waiting}</span>}
      </a>
    </div>
  );
}

/** Phones: the same jump, one tap from the top bar (the rail is a drawer there). */
export function AppSwitchPill() {
  const waiting = useInventoryWaiting();
  return (
    <a className="rp-app-pill" href={INVENTORY_APP_URL} target="_blank" rel="noopener"
      aria-label={waiting ? `Open the inventory app. ${waitingWords(waiting)}` : "Open the inventory app"}
      onClick={(e) => follow(e, INVENTORY_APP_URL)}>
      {/* The outline sits on the inner face so the whole 44px row stays tappable. */}
      <span className="rp-app-pill-face">
        Inventory
        <ArrowUpRight size={14} aria-hidden />
        {!!waiting && <span className="rp-app-switch-badge" aria-hidden>{waiting > 99 ? "99+" : waiting}</span>}
      </span>
    </a>
  );
}

/** "See it in the inventory app" for one website order. */
export function InventoryOrderLink({ orderId, children }: { orderId: string; children?: ReactNode }) {
  const url = inventoryOrderUrl(orderId);
  return (
    <a className="rp-app-deeplink" href={url} target="_blank" rel="noopener" onClick={(e) => follow(e, url)}>
      {children ?? "See it in the inventory app"}
      <ArrowUpRight size={14} aria-hidden />
    </a>
  );
}
