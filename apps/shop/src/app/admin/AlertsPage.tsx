import { alertRoute, type AdminAlert, type AlertRoute } from "./adminAlerts";
import { INVENTORY_APP_URL, openInventoryApp } from "./appSwitch";
import { useShopWords } from "./shopWords";
import "./overview/overviewViz.css";

// The Alerts page (#alerts, Julian 12 November 2026): each alert as a tile like Home's To do (v4), urgent first.
// The list and the hidden ones come from AdminAlerts.tsx (visibleAlerts, useAlertDismissals) via the Dashboard.

/** The tile's small label and tone per alert tone (v4: alert tile for urgent, apricot for a look, white for reminders). */
const KIND: Record<string, string> = { danger: "Urgent", warning: "Needs a look" };
const TONE: Record<string, string> = { danger: "alert", warning: "apricot" };

const ACTION_LABEL: Record<string, string> = {
  retry: "Try again", inventory: "Open Inventory app link", general: "Open Backups", backups: "Open Backups", notifications: "Open email deliveries",
  payments: "Open Payments", invoices: "Open invoices", cardAccount: "Open Payments", webhook: "Open payment checks", order: "Open order", inventoryApp: "Open the inventory app",
};

export function AlertsPage({ alerts, hiddenCount, onDismiss, onShowHidden, onOpenOrder, onOpenOrders, onOpenWebhook, onOpenNotifications, onOpenGeneral, onOpenBackups, onOpenInventory, onOpenInvoices, onOpenRoute, onRetry }: {
  /** The alerts still showing (`visibleAlerts`). */
  alerts: AdminAlert[];
  /** How many are hidden in this browser; they can be brought back. */
  hiddenCount: number;
  onDismiss: (a: AdminAlert) => void;
  onShowHidden: () => void;
  onOpenOrder: (id: string) => void;
  onOpenOrders: () => void;
  onOpenWebhook: () => void;
  onOpenNotifications: () => void;
  onOpenGeneral?: () => void;
  /** The combined admin's one place for backups (Stockroom › Backups); without it a backup alert opens Settings › General. */
  onOpenBackups?: () => void;
  onOpenInventory?: () => void;
  /** Stockroom › Invoices (the automatic reminders' alert). */
  onOpenInvoices?: () => void;
  /** Opens the exact page and sub tab an alert names (`alertRoute`); without it the per-page callbacks above are used. */
  onOpenRoute?: (route: AlertRoute) => void;
  onRetry?: () => void;
}) {
  const w = useShopWords();
  // The inventory app's own to-do: the app switch brings its tab forward (or the phone hands the link over).
  const openApp = (hash = "#todo") => {
    const url = `${INVENTORY_APP_URL}${hash}`;
    if (!openInventoryApp(window, url)) window.open(url, "_blank", "noopener");
  };
  const runAction = (a: AdminAlert) => (a.action === "inventoryApp" ? openApp(a.appHash) : a.action === "retry" ? onRetry?.() : a.action === "inventory" ? onOpenInventory?.()
    : a.action === "general" || a.action === "backups" ? onOpenGeneral?.() : a.action === "notifications" ? onOpenNotifications()
      : a.action === "webhook" || a.action === "payments" || a.action === "cardAccount" ? onOpenWebhook()
        : a.action === "order" ? onOpenOrder(a.orderIds[0]) : onOpenOrders());
  const run = (a: AdminAlert) => {
    if (a.action === "backups" && onOpenBackups) return onOpenBackups();
    if (a.action === "invoices") return onOpenInvoices?.();
    const route = onOpenRoute && alertRoute(a);
    if (route) onOpenRoute(route);
    else runAction(a);
  };

  return (
    <div className="rp-stack">
      <ul className="rp-todo-tiles" aria-label={`Alerts (${alerts.length})`}>
        {alerts.map((a) => (
          <li key={a.id} className="rp-todo-tile" data-tone={TONE[a.tone] || "plain"} role={a.tone === "danger" ? "alert" : undefined}>
            <span className="rp-todo-kind">{KIND[a.tone] || "Reminder"}</span>
            <span className="rp-todo-title">{w(a.title)}</span>
            <span className="rp-todo-body">{w(a.detail)}</span>
            <span className="rp-todo-acts">
              <button type="button" className="rp-todo-go" onClick={() => run(a)}>{ACTION_LABEL[a.action] || "Review orders"}</button>
              <button type="button" className="rp-todo-done" aria-label={`Hide “${w(a.title)}” for now`} onClick={() => onDismiss(a)}>Hide for now</button>
            </span>
          </li>
        ))}
        {!alerts.length && (
          <li className="rp-todo-tile" data-quiet="" data-clear="">
            <span className="rp-todo-title">All clear</span>
            <span className="rp-todo-body">Nothing needs you right now. New alerts show up here and in the top bar.</span>
          </li>
        )}
      </ul>
      {hiddenCount > 0 && (
        <p className="rp-hint">
          {hiddenCount} hidden for now. <button type="button" className="rp-home-link" onClick={onShowHidden}>Show them again</button>
        </p>
      )}
    </div>
  );
}
