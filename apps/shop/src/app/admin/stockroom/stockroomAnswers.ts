// What other admin pages ask of the stockroom (the book page's stock and sales, the match for a new book, All sales,
// Home's to-dos and today at the fair), answered here from the stockroom's records with the stockroom's own rules
// (book-summary.js, fair-mode.js, todo.ts). It replaces the old stockroom app that answered from a hidden frame.
import { bookSummary, findBook, salesRows, todoItems } from "@stockroom/book-summary.js";
import { fairDaySummary, fairForAdmin, readCurrentFair, registerSalesForDay } from "@stockroom/fair-mode.js";
import { localDay } from "@stockroom/calendar-day.js";

import type { StockroomBook, StockroomFair, StockroomMatch, StockroomSale, StockroomTodo } from "../stockroomBridge";
import type { StockroomRecords } from "./stockroomData";
import { buildTodo, readDismissed } from "./todo";

export type Ask = { what: "book"; book: string } | { what: "find"; isbn?: string; title?: string } | { what: "todo" } | { what: "sales"; since?: string } | { what: "fair" };
export type Answer =
  | StockroomBook | { missing: true } | { match: StockroomMatch | null } | { items: StockroomTodo[] }
  | { rows: StockroomSale[]; partial: boolean } | StockroomFair | null;

/** The answer to one question from the records; null when the records can't answer it (an item whose records are missing). */
export function answerFrom(question: Ask, records: StockroomRecords, opts: { now?: Date; words?: (t: string) => string; booksShop?: boolean } = {}): Answer {
  const books = Object.fromEntries(records.books.map((b) => [b.id, b]));
  switch (question.what) {
    case "find": return { match: findBook(books, { isbn: question.isbn, title: question.title }) };
    case "sales": return salesRows(books, records.states, { since: question.since || "" });
    case "todo": return { items: todoItems(buildTodo(records, { words: opts.words, booksShop: opts.booksShop, dismissed: readDismissed(), now: opts.now })) };
    case "fair": {
      const day = localDay(opts.now || new Date());
      const list = records.books.map((b) => ({ id: b.id, title: b.title, currency: String(b.currency || ""), hist: (records.states[b.id]?.hist as unknown[]) || [] }));
      const left = Object.fromEntries(records.books.map((b) => { const n = Number(records.states[b.id]?.stock); return [b.id, Number.isFinite(n) ? n : null]; }));
      // Till sales are stored straight to the cloud from the admin, so there is never an upload waiting.
      return fairForAdmin(fairDaySummary(registerSalesForDay(list, day), left), readCurrentFair(day), { tone: "ok", text: "" }, day);
    }
    case "book": {
      const book = books[question.book];
      if (!book) return { missing: true };
      const state = records.states[question.book];
      // An item with no records yet starts as the stockroom starts it: everything printed on the shelf, nothing sold.
      return bookSummary(question.book, state || { stock: book.maxPrint, hist: [], ledger: [], stores: [] }, book);
    }
  }
}
