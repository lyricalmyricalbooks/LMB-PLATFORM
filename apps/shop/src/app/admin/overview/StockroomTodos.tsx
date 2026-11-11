// Home's "Needs you" lines from the stockroom, in the combined admin only (shop + stockroom plan; docs/combined-admin.md
// step 3): one line per kind of stockroom to-do, so a press with both apps sees one list of what needs them. The
// list is the To-do page's (stockroom/todo.ts, built on the stockroom's own `buildAttentionSignals` and `todoItems`), so
// Home and the page always agree; Home only counts them.
import { useEffect, useRef, useState, type ReactElement } from "react";
import { todoItems } from "@stockroom/book-summary.js";
import { RunRow } from "./OverviewParts";
import { sellsBooks } from "../sells";
import { useShopSells, useShopWords } from "../shopWords";
import { stockroomBridge, type StockroomTodo } from "../stockroomBridge";
import { isRefusal, stockroomApi, type StockroomRecords } from "../stockroom/stockroomData";
import { buildTodo, readDismissed } from "../stockroom/todo";

/** How long Home waits before asking, so its own figures load first. */
const FIRST_ASK_MS = 1_500;
const REFRESH_MS = 5 * 60_000;

/** Kinds of stockroom to-do, in Home's order, with the words for many and for one. */
export const TODO_GROUPS: Array<{ group: string; label: string; one: string; kind: string }> = [
  { group: "orders", label: "sales to sort out", one: "sale to sort out", kind: "Sales" },
  { group: "money", label: "payments to chase or record", one: "payment to chase or record", kind: "Payments" },
  { group: "stock", label: "stock counts to check", one: "stock count to check", kind: "Stock" },
  { group: "catalogue", label: "book details to fill in", one: "book detail to fill in", kind: "Books" },
  { group: "setup", label: "things to set up", one: "thing to set up", kind: "Setup" },
];
const OTHER = { group: "", label: "other things to do", one: "other thing to do", kind: "To do" };

/**
 * Home already lists books to reprint and sold out from the website's own figures, so the stockroom's "running low" and
 * "getting low" alerts would count the same book twice there; its other stock to-dos (a count that doesn't match the
 * records) stay. The stockroom's To-do page still shows them all.
 */
export const onHomeOnce = (item: StockroomTodo) => !/^stock-(low|getting-low):/.test(item.id);

export type StockroomTodoState = { items: StockroomTodo[] | null; loading: boolean; failed: boolean };

/** Home's list from the stockroom's records: the same list the To-do page draws (todo.ts), minus what the owner dismissed there. */
export async function nativeTodoItems(words: (text: string) => string, booksShop: boolean, load: () => Promise<StockroomRecords> = stockroomApi.load): Promise<StockroomTodo[]> {
  const records = await load();
  return todoItems(buildTodo(records, { words, booksShop, dismissed: readDismissed() })).filter(onHomeOnce);
}

/**
 * The stockroom's to-dos for Home, read from the records right after Home opens and again every five minutes it is on
 * screen. Only a read that fails for a reason other than the owner-only rule falls back to asking the stockroom frame.
 */
export function useStockroomTodos(enabled: boolean): StockroomTodoState {
  const [state, setState] = useState<StockroomTodoState>({ items: null, loading: enabled, failed: false });
  const w = useShopWords();
  const sells = useShopSells();
  // The timer below outlives a render, so it reads the latest words from here.
  const latest = useRef({ w, booksShop: sellsBooks(sells) });
  latest.current = { w, booksShop: sellsBooks(sells) };
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const viaFrame = async () => {
      const answer = await stockroomBridge.askUntil<{ items: StockroomTodo[] } | { refused: true }>({ what: "todo" });
      if (!alive) return;
      if (answer && "items" in answer && Array.isArray(answer.items)) setState({ items: answer.items.filter(onHomeOnce), loading: false, failed: false });
      else if (answer && "refused" in answer) setState({ items: [], loading: false, failed: false });
      else setState((s) => ({ items: s.items, loading: false, failed: !s.items }));
    };
    const ask = async () => {
      try {
        const items = await nativeTodoItems(latest.current.w, latest.current.booksShop);
        if (alive) setState({ items, loading: false, failed: false });
      } catch (error) {
        if (!alive) return;
        // A team member is refused (owner-only records): no lines, not an error. Anything else could be a dropped connection,
        // never an empty list, so the frame gets a try and a failure there says so on Home.
        if (isRefusal(error)) setState({ items: [], loading: false, failed: false });
        else await viaFrame();
      }
    };
    const first = window.setTimeout(() => { void ask(); }, FIRST_ASK_MS);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void ask(); }, REFRESH_MS);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(timer); };
  }, [enabled]);
  return state;
}

/** The to-dos in groups, in Home's order; a kind with nothing to do is still listed, so Home can say it is clear. */
export function groupTodos(items: StockroomTodo[]): Array<{ group: string; label: string; one: string; kind: string; items: StockroomTodo[] }> {
  const known = new Set(TODO_GROUPS.map((g) => g.group));
  const groups = TODO_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.group) }));
  const other = items.filter((i) => !known.has(i.group));
  return other.length ? [...groups, { ...OTHER, items: other }] : groups;
}

/** Home's lines for the stockroom's to-dos (children of `RunList`), and how many things they add to its count. */
export function stockroomRunRows(state: StockroomTodoState, words: (text: string) => string): { rows: ReactElement[]; count: number | null } {
  // Not answered yet: the lines wait. Couldn't be reached: no lines (Home says the stockroom's counts are missing),
  // never a wrong "all clear".
  if (!state.items) {
    if (!state.loading) return { rows: [], count: 0 };
    return { count: null, rows: TODO_GROUPS.map((g) => <RunRow key={`stockroom-${g.group}`} label={words(g.label)} count={null} loading detail="" onOpen={() => {}} openLabel="" />) };
  }
  const rows = groupTodos(state.items).map((g) => {
    const first = g.items[0];
    const more = g.items.length - 1;
    return (
      <RunRow key={`stockroom-${g.group || "other"}`} kind={words(g.kind)} label={words(g.label)} one={words(g.one)} count={g.items.length} loading={false}
        detail={first ? `${words(first.label)}${more > 0 ? ` and ${more} more` : ""}` : ""}
        onOpen={() => (g.items.length === 1 ? stockroomBridge.openPage("todo", { todo: first.id }) : stockroomBridge.openPage("todo"))}
        openLabel={g.items.length === 1 ? "Open it" : "Open the to-do list"} />
    );
  });
  return { rows, count: state.items.length };
}
