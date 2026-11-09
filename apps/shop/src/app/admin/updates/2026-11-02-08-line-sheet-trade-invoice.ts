import type { AppUpdate } from "../appUpdates";

export default {
  id: "line-sheet-trade-invoice",
  date: "2026-11-02",
  title: "A tidier line sheet, and trade orders ready to invoice in the stockroom",
  summary: "The printed line sheet now uses the same page layout that your other printed documents will share: your name and address at the top, the title, a short details block, a clear table and your terms at the foot. The prices are exactly the same. A trade account's order placed on invoice terms now shows up in the stockroom under Trade invoices to send, and one press of Prepare the invoice opens the invoice already filled in with the shop's details, the lines, shipping, tax and the due date.",
  links: [{ label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
