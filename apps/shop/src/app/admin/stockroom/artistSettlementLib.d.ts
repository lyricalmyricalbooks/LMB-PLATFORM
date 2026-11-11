// Types for the stockroom's author settle-up rules (`@stockroom/artist-settlement.js`), used by authorMoney.ts.
type Row = Record<string, any>;

declare module "@stockroom/artist-settlement.js" {
  export type SettleBalance = {
    heldGross: number; heldShare: number; publisherHeld: number; otherDebt: number; royaltiesOwed: number; overpaid: number;
    expensesOwed: number; expenses: Row[]; expensesLeftOut: number; netToPublisher: number; amount: number;
    direction: "to-publisher" | "to-artist" | "settled"; royaltiesCarried?: number;
  };
  export type SettlePlan = { id: string; signature: string; balance: SettleBalance; heldSales: Row[]; royaltyCredit: number; error: string; hasWork: boolean; [k: string]: unknown };
  export function planArtistSettlement(book: Row, state: Row): SettlePlan | null;
  export function artistSettlementStatement(book: Row, balance: SettleBalance, date: string, recorded?: boolean): string;
  export function applyArtistSettlement(book: Row, state: Row, plan: SettlePlan, opts: { date: string; method?: string; notes?: string }): { ok: true; record: Row } | { ok: false; reason: string };
  export function undoArtistSettlement(state: Row, id: string): { ok: boolean; reason?: string };
}
