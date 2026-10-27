import { useState } from "react";
import { X } from "lucide-react";
import { IconButton, PrimaryButton, SecondaryButton } from "./riso/components";
import { alertRoute, alertSignature, type AdminAlert, type AlertRoute } from "./adminAlerts";
import { INVENTORY_APP_URL, openInventoryApp } from "./appSwitch";

const KEY = "admin-dismissed-alerts";
/** Hidden alerts are remembered in this browser (not just this tab), newest last, so closing one keeps it closed. */
const KEEP = 200;
const readDismissed = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((s) => typeof s === "string") : [];
  } catch { return []; }
};

/** How many alerts show before the rest fold behind "Show N more". */
const SHOWN = 2;
const RANK: Record<string, number> = { danger: 0, warning: 1 };
const GLYPH: Record<string, string> = { danger: "✕", warning: "⚠" };
const WORD: Record<string, string> = { danger: "Urgent", warning: "Needs attention" };

const ACTION_LABEL: Record<string, string> = {
  retry: "Try again", inventory: "Open Inventory app link", general: "Open Backups", notifications: "Open email deliveries",
  payments: "Open Payments", webhook: "Open webhook health", order: "Open order", inventoryApp: "Open the inventory app",
};

// Alerts shown above every admin page. Dismissing hides an alert in this browser until
// a new order (or new change) joins it. Urgent ones come first; past two the rest fold away.
export function AdminAlerts({ alerts, onOpenOrder, onOpenOrders, onOpenWebhook, onOpenNotifications, onOpenGeneral, onOpenInventory, onOpenRoute, onRetry }: {
  alerts: AdminAlert[];
  onOpenOrder: (id: string) => void;
  onOpenOrders: () => void;
  onOpenWebhook: () => void;
  onOpenNotifications: () => void;
  onOpenGeneral?: () => void;
  onOpenInventory?: () => void;
  /** Opens the exact page and sub tab an alert names (`alertRoute`); without it the per-page callbacks above are used. */
  onOpenRoute?: (route: AlertRoute) => void;
  onRetry?: () => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [expanded, setExpanded] = useState(false);
  const visible = alerts
    .filter((a) => !dismissed.includes(alertSignature(a)))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (RANK[x.a.tone] ?? 2) - (RANK[y.a.tone] ?? 2) || x.i - y.i)
    .map(({ a }) => a);
  if (!visible.length) return null;

  const dismiss = (a: AdminAlert) => {
    const next = [...dismissed.filter((s) => s !== alertSignature(a)), alertSignature(a)].slice(-KEEP);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  // The inventory app's own to-do: the app switch brings its tab forward (or the phone hands the link over).
  const openApp = (hash = "#todo") => {
    const url = `${INVENTORY_APP_URL}${hash}`;
    if (!openInventoryApp(window, url)) window.open(url, "_blank", "noopener");
  };
  const run = (a: AdminAlert) => {
    const route = onOpenRoute && alertRoute(a);
    if (route) onOpenRoute(route);
    else runAction(a);
  };
  const runAction = (a: AdminAlert) => (a.action === "inventoryApp" ? openApp(a.appHash) : a.action === "retry" ? onRetry?.() : a.action === "inventory" ? onOpenInventory?.()
    : a.action === "general" ? onOpenGeneral?.() : a.action === "notifications" ? onOpenNotifications()
      : a.action === "webhook" || a.action === "payments" ? onOpenWebhook()
        : a.action === "order" ? onOpenOrder(a.orderIds[0]) : onOpenOrders());

  const shown = expanded ? visible : visible.slice(0, SHOWN);
  const hidden = visible.length - shown.length;

  return (
    <section aria-label={`Alerts (${visible.length})`} role="region" className="rp-alerts">
      {shown.map((a) => (
        <div key={a.id} role={a.tone === "danger" ? "alert" : "status"} className="rp-alert" data-tone={a.tone}>
          <span className="rp-alert-glyph" aria-hidden="true">{GLYPH[a.tone] || "●"}</span>
          <div className="rp-alert-text">
            <span className="rp-alert-kicker">{WORD[a.tone] || "Reminder"}</span>
            <strong className="rp-alert-title">{a.title}</strong>
            <span className="rp-alert-detail">{a.detail}</span>
          </div>
          <div className="rp-alert-actions">
            <PrimaryButton size="sm" onClick={() => run(a)}>{ACTION_LABEL[a.action] || "Review orders"}</PrimaryButton>
            <IconButton label={`Hide “${a.title}” for now`} className="rp-alert-close" onClick={() => dismiss(a)}>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
        </div>
      ))}
      {(hidden > 0 || (expanded && visible.length > SHOWN)) && (
        <SecondaryButton size="sm" className="rp-alerts-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer alerts" : `Show ${hidden} more alert${hidden === 1 ? "" : "s"}`}
        </SecondaryButton>
      )}
    </section>
  );
}
