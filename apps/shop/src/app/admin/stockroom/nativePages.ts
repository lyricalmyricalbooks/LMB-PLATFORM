// The stockroom pages the admin draws itself. One line per page, so pages built side by side never meet in Dashboard:
//   <stockroom page id>: lazy(() => import("./XPage").then((m) => ({ default: m.XPage })))
// A page listed here is drawn from the stockroom's records (stockroomData.ts); every other stockroom page still opens in
// the old frame (StockroomFrame.tsx) until it is rebuilt. Each page gets `NativePageProps`.
import { lazy, type ComponentType } from "react";

/** What every native stockroom page receives from the admin shell. */
export type NativePageProps = {
  /** Open another stockroom page by its id (combined.ts STOCKROOM_PAGES). */
  onOpen: (page: string) => void;
  /** Whether an id is a stockroom page the admin knows (a fix button only shows when it is). */
  isPage: (id: string) => boolean;
};

export const NATIVE_PAGES: Record<string, ComponentType<NativePageProps>> = {
  dashboard: lazy(() => import("./StockPage").then((m) => ({ default: m.StockPage }))),
  todo: lazy(() => import("./TodoPage").then((m) => ({ default: m.TodoPage }))),
};
