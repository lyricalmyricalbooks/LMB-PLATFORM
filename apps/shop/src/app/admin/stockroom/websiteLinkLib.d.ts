// Types for the stockroom's website-link rules (apps/stockroom/src/lib/website-link.js) and the dated exchange rates.
declare module "@stockroom/website-link.js" {
  export type WebDoc = { id?: string; web?: Record<string, any>; pending?: boolean; imported?: Record<string, any> | null; shipmentReply?: Record<string, any> | null; app?: Record<string, any> };
  export type WebAction =
    | { kind: "new"; bookId: string; row: Record<string, any> }
    | { kind: "replace"; bookId: string; key: string; replacedBy: string }
    | { kind: "own" | "adopt" | string; bookId: string; key?: string; uid?: string; patch?: Record<string, any> | null };
  export type WebReason = { reason: string; bookId?: string; currency?: string; day?: string; candidates?: Array<{ key: string; row: Record<string, any>; sameEmail?: boolean; sameAmount?: boolean }> };
  export type WebPlan = {
    orderId: string; hash: string; num: string; day: string; customer: string; unlinked: Array<{ title: string; qty: number }>;
    replyAt: string; replyHash: string; actions: WebAction[]; reasons: WebReason[]; blocked: string[]; effect: Record<string, number>;
    decisions: Record<string, any>; status: "ready" | "review" | "blocked" | "test" | "stale"; preview?: Array<{ bookId: string; copies: number }>;
  };
  export type WebPlanContext = {
    histByBook: Record<string, unknown[]>;
    knowsBook?: (id: string) => boolean;
    canWrite?: (id: string) => boolean;
    bookCurrencyOf?: (id: string) => string;
    cadRateFor?: (cur: string, day: string) => number | null;
    piOfCharge?: (chargeId: string) => string;
    consentAt?: string;
    decisions?: Record<string, any>;
  };
  export const WEBSITE_IMPORT_BATCH: number;
  export function planWebsiteOrder(doc: WebDoc, ctx: WebPlanContext): WebPlan;
  export function summarizePlans(plans: WebPlan[]): { fresh: number; linked: number; needYou: number; blocked: number; tests: number; upToDate: number };
  export function rowKey(row: unknown): string;
  export function promisedPreorders(hist: unknown[]): { copies: number; orders: number };
  export function linkedPostageFor(orderNumber: unknown, expenses: unknown[]): Record<string, any> | null;
  export function appShipmentFor(rows: unknown[], linkedPostage: unknown, web: unknown): ({ hash: string } & Record<string, any>) | null;
  export function hasAppTracking(row: unknown): boolean;
  export function websiteQuietSince(heartbeatAt: unknown, opts?: { now?: number; online?: boolean }): string;
  export type PublishInput = {
    bookIds?: string[]; books?: Record<string, { hist?: unknown[]; ledger?: unknown[]; metadata?: Record<string, unknown> }>;
    catalog?: Record<string, unknown>; orderDocs?: Record<string, WebDoc | null>; marks?: unknown[]; shipments?: unknown[];
    testShipments?: unknown[]; heldOrders?: Array<{ orderId: string; books: string[] }>; now?: string; build?: string; device?: string;
  };
  export function planWebsitePublish(input: PublishInput): {
    feeds: Array<{ bookId: string; doc: Record<string, unknown> }>;
    orderUpdates: Array<{ orderId: string; data: Record<string, unknown> }>;
    accepted: string[]; held: string[]; refused: Array<{ orderId: string; reason: string }>;
    sent: Array<{ orderId: string; hash: string }>; current: Array<{ orderId: string; hash: string }>;
  };
}
declare module "@stockroom/fx-sources.js" {
  export const DATED_RATE_SOURCES: Array<{ name: string; url: (from: string, to: string, date: string) => string; read: (json: unknown, from: string, to: string) => { rate: number; date: string } | null }>;
}
declare module "@stockroom/sale-fx.js" {
  export const FX_HISTORY_KEY: string;
  export function datedRateKey(from: string, to: string, date: string): string;
}
