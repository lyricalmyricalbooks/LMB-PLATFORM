// The stockroom pages the admin draws itself. One line per page, so pages built side by side never meet in Dashboard:
//   <stockroom page id>: lazy(() => import("./XPage").then((m) => ({ default: m.XPage })))
// A page listed here is drawn from the stockroom's records (stockroomData.ts); every other stockroom page still opens in
// the old frame (StockroomFrame.tsx) until it is rebuilt. Each page gets `NativePageProps`.
import { lazy, type ComponentType } from "react";

/** What every native stockroom page receives from the admin shell. */
export type NativePageProps = {
  /** Open another stockroom page by its id (combined.ts STOCKROOM_PAGES). */
  onOpen: (page: string, opts?: { bookId?: string }) => void;
  /** Whether an id is a stockroom page the admin knows (a fix button only shows when it is). */
  isPage: (id: string) => boolean;
  /** The book to open when the page was reached from one (a to-do line's fix button, Home); absent from the menu. */
  bookId?: string;
};

export const NATIVE_PAGES: Record<string, ComponentType<NativePageProps>> = {
  dashboard: lazy(() => import("./StockPage").then((m) => ({ default: m.StockPage }))),
  history: lazy(() => import("./SalesPage").then((m) => ({ default: m.SalesPage }))),
  customers: lazy(() => import("./CustomersPage").then((m) => ({ default: m.CustomersPage }))),
  todo: lazy(() => import("./TodoPage").then((m) => ({ default: m.TodoPage }))),
  taxcenter: lazy(() => import("./TaxCenterPage").then((m) => ({ default: m.TaxCenterPage }))),
  expenses: lazy(() => import("./ExpensesPage").then((m) => ({ default: m.ExpensesPage }))),
  intel: lazy(() => import("./AskPage").then((m) => ({ default: m.AskPage }))),
  consignment: lazy(() => import("./StockistsPage").then((m) => ({ default: m.StockistsPage }))),
  shipping: lazy(() => import("./ShippingPage").then((m) => ({ default: m.ShippingPage }))),
  pos: lazy(() => import("./TillPage").then((m) => ({ default: m.TillPage }))),
  manual: lazy(() => import("./ManualPage").then((m) => ({ default: m.ManualPage }))),
  qrcodes: lazy(() => import("./QrCodesPage").then((m) => ({ default: m.QrCodesPage }))),
  reconcile: lazy(() => import("./ReconcilePage").then((m) => ({ default: m.ReconcilePage }))),
};
