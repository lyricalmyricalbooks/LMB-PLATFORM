// Types for the stockroom's own answers the admin gives other pages (stockroomAnswers.ts): one book's figures, the book
// that looks like a website book, every recorded sale, and the till's day. Functions only, so other files may add more.
declare module "@stockroom/book-summary.js" {
  export function bookSummary(id: string, state: unknown, book: unknown): import("../stockroomBridge").StockroomBook;
  export function findBook(books: Record<string, unknown>, args?: { isbn?: string; title?: string }): import("../stockroomBridge").StockroomMatch | null;
  export function salesRows(books: Record<string, unknown>, states: Record<string, unknown>, opts?: { since?: string }): { rows: import("../stockroomBridge").StockroomSale[]; partial: boolean };
}
declare module "@stockroom/fair-mode.js" {
  export function fairForAdmin(sum: unknown, fair: { name: string } | null, pill: { tone: string; text: string } | null, day: string): import("../stockroomBridge").StockroomFair;
}
