// Tax centre › Year-end stock value: the old stockroom's inventory valuation (features/inventory-valuation.js
// calculateInventoryValuationData, downloadInventoryValuationCSV, submitInventoryWriteOff), line for line. The cost and
// retail value of every unsold copy, at home and out on consignment, and the two adjustments it records against the Tax
// centre: a section 10 valuation (stock stays, a non-cash write-down) and a physical disposal (copies leave the stock).
// Pure; the saves are in StockValueCard.tsx.
import { csvCell } from "@stockroom/csv.js";
import { createInventoryDisposalExpense, createSection10Adjustment, inventoryAdjustmentCsvRows } from "@stockroom/inventory-adjustment.js";
import { deriveOnHand, deriveStockBreakdown, recordInventoryDisposal } from "@stockroom/inventory.js";
import { getBookCurrencyCode, roundCents } from "@stockroom/money.js";
import { SHOP_CURRENCY } from "../moneySign";

type Row = Record<string, any>;

export type StockValueItem = {
  id: string; title: string; isbn: string; format: string; printRun: number; stockOnHand: number; publisherStockOnHand: number;
  stockConsigned: number; totalUnsold: number; totalSold: number; compsDamaged: number; currency: string; fxRate: number;
  listPrice: number; unitCost: number; unitMargin: number; unitMarginPct: number;
  onHandCostCAD: number; consignedCostCAD: number; totalCostCAD: number; onHandRetailCAD: number; consignedRetailCAD: number;
  totalRetailCAD: number; potentialGrossProfitCAD: number; storeBreakdown: Array<{ storeName: string; onHand: number }>;
};

export function stockValue(books: Row[], states: Record<string, Row>, fxRateCache: Record<string, number>) {
  const items: StockValueItem[] = [];
  const totals = {
    totalTitles: 0, totalPrintRun: 0, totalStockOnHand: 0, totalStockConsigned: 0, totalUnsoldUnits: 0, totalSoldUnits: 0,
    totalOnHandCostCAD: 0, totalConsignedCostCAD: 0, totalAssetValueCostCAD: 0, totalOnHandRetailCAD: 0, totalConsignedRetailCAD: 0,
    totalAssetValueRetailCAD: 0, totalPotentialGrossProfitCAD: 0, weightedAvgMarginPct: 0,
  };
  let totalMarginSum = 0, marginCount = 0;
  for (const book of books) {
    // A book with no records yet has its whole print run on hand, as the old app's defaultState gives it.
    const s: Row = states[book.id] || { stock: book.maxPrint };
    const stockOnHand = Math.max(0, parseInt(s.stock, 10) || 0);
    const storesList: Row[] = Array.isArray(s.stores) ? s.stores : [];
    const storeBreakdown = storesList
      .map((st) => ({ storeName: st.name || st.storeName || st.store || "Partner Store", onHand: Math.max(0, parseInt(st.outstanding || (st.qty != null && st.sold != null ? st.qty - st.sold : 0), 10)) }))
      .filter((x) => x.onHand > 0);
    let stockConsigned = 0;
    for (const st of storeBreakdown) stockConsigned += st.onHand;
    const totalUnsold = stockOnHand + stockConsigned;
    const publisherStockOnHand = deriveStockBreakdown(s, book).publisherOnHand;
    let totalSold = 0;
    for (const h of (s.hist || []) as Row[]) { if (h.consignmentLink || h.voided || h.gratuity) continue; totalSold += parseInt(h.qty, 10) || 0; }
    for (const l of storesList) totalSold += parseInt(l.sold, 10) || 0;
    const printRun = parseInt(book.maxPrint || book.totalPrinted || 0, 10) || totalUnsold + totalSold;
    const compsDamaged = Math.max(0, printRun - totalUnsold - totalSold);
    const cur = getBookCurrencyCode(book);
    const fxRate = cur === SHOP_CURRENCY ? 1 : fxRateCache[`${cur}_${SHOP_CURRENCY}`] || 1;
    const listPrice = parseFloat(book.listPrice || 0);
    const rawCost = parseFloat(book.productionCost || 0);
    // The production cost is the whole run's (the edit form says so, and the year report reads it that way): shared
    // over the run. With no print run typed, the run is every copy sold plus every copy left.
    const unitCost = printRun > 0 ? rawCost / printRun : 0;
    const unitMargin = Math.max(0, listPrice - unitCost);
    const unitMarginPct = listPrice > 0 ? (unitMargin / listPrice) * 100 : 0;
    if (listPrice > 0) { totalMarginSum += unitMarginPct * totalUnsold; marginCount += totalUnsold; }
    const onHandCostCAD = stockOnHand * unitCost * fxRate, consignedCostCAD = stockConsigned * unitCost * fxRate, totalCostCAD = totalUnsold * unitCost * fxRate;
    const onHandRetailCAD = stockOnHand * listPrice * fxRate, consignedRetailCAD = stockConsigned * listPrice * fxRate, totalRetailCAD = totalUnsold * listPrice * fxRate;
    const potentialGrossProfitCAD = totalRetailCAD - totalCostCAD;
    items.push({
      id: book.id, title: book.title || "Untitled", isbn: book.isbn || "—", format: book.format || "Paperback", printRun, stockOnHand, publisherStockOnHand,
      stockConsigned, totalUnsold, totalSold, compsDamaged, currency: cur, fxRate, listPrice, unitCost, unitMargin, unitMarginPct,
      onHandCostCAD, consignedCostCAD, totalCostCAD, onHandRetailCAD, consignedRetailCAD, totalRetailCAD, potentialGrossProfitCAD, storeBreakdown,
    });
    totals.totalTitles++; totals.totalPrintRun += printRun; totals.totalStockOnHand += stockOnHand; totals.totalStockConsigned += stockConsigned;
    totals.totalUnsoldUnits += totalUnsold; totals.totalSoldUnits += totalSold; totals.totalOnHandCostCAD += onHandCostCAD;
    totals.totalConsignedCostCAD += consignedCostCAD; totals.totalAssetValueCostCAD += totalCostCAD; totals.totalOnHandRetailCAD += onHandRetailCAD;
    totals.totalConsignedRetailCAD += consignedRetailCAD; totals.totalAssetValueRetailCAD += totalRetailCAD; totals.totalPotentialGrossProfitCAD += potentialGrossProfitCAD;
  }
  totals.weightedAvgMarginPct = marginCount > 0 ? totalMarginSum / marginCount : 0;
  return { items, totals };
}

export function stockValueCsv(books: Row[], states: Record<string, Row>, fxRateCache: Record<string, number>, businessExpenses: unknown, pressName: string, today: string): string {
  const { items, totals } = stockValue(books, states, fxRateCache);
  const esc = csvCell;
  let csv = `${pressName} Book Inventory Valuation Report\n`;
  csv += "Generated on: " + today + "\n";
  csv += `Active Titles: ${totals.totalTitles} | Total Unsold Units: ${totals.totalUnsoldUnits} (${totals.totalStockOnHand} Warehouse / ${totals.totalStockConsigned} Consigned)\n`;
  csv += `Total Balance Sheet Inventory Asset Cost: CAD $${totals.totalAssetValueCostCAD.toFixed(2)} | Total Retail Value: CAD $${totals.totalAssetValueRetailCAD.toFixed(2)}\n\n`;
  csv += "Book ID,Title,ISBN,Binding / Format,Print Run,Stock On-Hand (Warehouse),Stock Consigned (Stores),Total Unsold Inventory,Lifetime Sold Units,Currency,Unit Print Cost (Native),Unit Retail Price (Native),Unit Margin (Native),Unit Margin %,FX Rate (CAD),On-Hand Asset Value Cost (CAD),Consigned Asset Value Cost (CAD),TOTAL ASSET VALUE COST (CAD),TOTAL RETAIL VALUE (CAD),POTENTIAL GROSS PROFIT (CAD)\n";
  for (const item of items) {
    csv += `${esc(item.id)},${esc(item.title)},${esc(item.isbn)},${esc(item.format)},${item.printRun},${item.stockOnHand},${item.stockConsigned},${item.totalUnsold},${item.totalSold},${esc(item.currency)},${item.unitCost.toFixed(2)},${item.listPrice.toFixed(2)},${item.unitMargin.toFixed(2)},${item.unitMarginPct.toFixed(1)}%,${item.fxRate.toFixed(4)},${item.onHandCostCAD.toFixed(2)},${item.consignedCostCAD.toFixed(2)},${item.totalCostCAD.toFixed(2)},${item.totalRetailCAD.toFixed(2)},${item.potentialGrossProfitCAD.toFixed(2)}\n`;
  }
  csv += `TOTALS,"Total Active Titles: ${totals.totalTitles}",,,${totals.totalPrintRun},${totals.totalStockOnHand},${totals.totalStockConsigned},${totals.totalUnsoldUnits},${totals.totalSoldUnits},CAD,,,,,,${totals.totalOnHandCostCAD.toFixed(2)},${totals.totalConsignedCostCAD.toFixed(2)},${totals.totalAssetValueCostCAD.toFixed(2)},${totals.totalAssetValueRetailCAD.toFixed(2)},${totals.totalPotentialGrossProfitCAD.toFixed(2)}\n`;
  const adjustmentRows = inventoryAdjustmentCsvRows(businessExpenses);
  if (adjustmentRows.length > 1) {
    csv += "\nSECTION 10 VALUATIONS AND PHYSICAL DISPOSALS\n";
    for (const row of adjustmentRows) csv += row.map(csvCell).join(",") + "\n";
  }
  return csv;
}

/** The latest section 10 write-down for the book in an earlier year (what this year's adjustment is measured against). */
export function priorWriteDown(businessExpenses: Row[] | undefined, bookId: string, date: string): number {
  const year = String(date || "").slice(0, 4);
  const prior = (businessExpenses || [])
    .filter((e) => e?.inventoryAdjustment?.type === "section10" && e.inventoryAdjustment.bookId === bookId && e.date)
    .sort((a, b) => (String(b.date) < String(a.date) ? -1 : String(b.date) > String(a.date) ? 1 : 0))
    .find((e) => String(e.date).slice(0, 4) < year);
  const d = prior?.inventoryAdjustment;
  return roundCents(Number(d?.closingWriteDownCAD ?? d?.writeDownCAD ?? 0));
}

export type AdjustmentMode = "valuation" | "disposal";
export type AdjustmentForm = { bookId: string; qty: string; nrv: string; date: string; reason: string; evidence: string; notes: string };

/** How many copies the adjustment can cover: every unsold copy for a valuation, only the press's own for a disposal. */
export const adjustable = (item: StockValueItem, mode: AdjustmentMode) => (mode === "disposal" ? item.publisherStockOnHand : item.totalUnsold);

/** The figure the form shows: this year's tax adjustment (valuation) or the cost removed (disposal). */
export function adjustmentPreview(item: StockValueItem, mode: AdjustmentMode, form: AdjustmentForm, businessExpenses: Row[] | undefined): number {
  const quantity = Math.max(0, Number(form.qty) || 0);
  const nrv = mode === "valuation" ? Math.max(0, Number(form.nrv) || 0) : 0;
  const closing = roundCents(Math.max(0, quantity * (item.unitCost - Math.min(nrv, item.unitCost)) * item.fxRate));
  const prior = mode === "valuation" ? priorWriteDown(businessExpenses, item.id, form.date) : 0;
  return roundCents(closing - prior);
}

/** The Tax centre record for the adjustment (the stockroom's own rules check it), or the reason it can't be made. */
export function buildAdjustment(item: StockValueItem, mode: AdjustmentMode, form: AdjustmentForm, businessExpenses: Row[] | undefined, id: string): { record: Row } | { error: string } {
  const quantity = Number(form.qty);
  const available = adjustable(item, mode);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) return { error: `Quantity must be between 1 and ${available}.` };
  const input = {
    id, bookId: item.id, title: item.title, quantity, unitCostNative: item.unitCost, nrvPerUnitNative: Number(form.nrv), currency: item.currency,
    fxRate: item.fxRate, date: form.date, reason: form.reason, evidence: form.evidence, notes: form.notes, priorWriteDownCAD: priorWriteDown(businessExpenses, item.id, form.date),
  };
  try { return { record: mode === "valuation" ? createSection10Adjustment(input) : createInventoryDisposalExpense(input) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "That adjustment can't be recorded." }; }
}

/** The Tax centre with the record first; a valuation replaces the book's earlier valuation for the same year. */
export function withAdjustment(tc: Row | null, record: Row, mode: AdjustmentMode): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  let list: Row[] = Array.isArray(cur.businessExpenses) ? cur.businessExpenses : [];
  if (list.some((e) => e.id === record.id)) return cur;
  if (mode === "valuation") {
    const year = String(record.date).slice(0, 4);
    list = list.filter((e) => !(e?.inventoryAdjustment?.type === "section10" && e.inventoryAdjustment.bookId === record.inventoryAdjustment.bookId && String(e.date).slice(0, 4) === year));
  }
  return { ...cur, businessExpenses: [record, ...list] };
}

/** The book with the disposed copies written off and its stock worked out again. Unchanged when already recorded. */
export function withDisposal(state: Row, book: Row, record: Row, form: AdjustmentForm): Row {
  const s: Row = structuredClone(state || {});
  if ((Array.isArray(s.ledger) ? s.ledger : []).some((e: Row) => e.id === record.id)) return state;
  recordInventoryDisposal(s, { id: record.id, date: record.date, qty: Number(form.qty), reason: form.reason, notes: form.notes });
  s.stock = deriveOnHand(s, book);
  return s;
}
