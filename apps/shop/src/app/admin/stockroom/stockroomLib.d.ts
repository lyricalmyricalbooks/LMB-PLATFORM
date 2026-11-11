// Types for the stockroom's plain-JS rules the admin imports through the `@stockroom` alias (vite.config.ts).
declare module "@stockroom/attention-signals.js" {
  export type SignalFix = { label?: string; kind: "book" | "edit-book" | "tab" | "taxcenter" | string; bookId?: string; tab?: string; section?: string };
  export type Signal = { id: string; group: string; status: "blocked" | "warn" | "info" | "ok" | string; icon?: string; label: string; detail: string; bookId?: string; fix?: SignalFix };
  export type AttentionResult = { signals: Signal[]; byGroup: Record<string, Signal[]>; total: number; urgent: number };
  export const SIGNAL_GROUPS: string[];
  export const GROUP_LABELS: Record<string, string>;
  export function isUrgent(signal: Signal): boolean;
  export function buildAttentionSignals(input: Record<string, unknown>): AttentionResult;
}
declare module "@stockroom/merge-state.js" {
  export function assembleParts(raw: Record<string, unknown>): { parts: Record<string, unknown>; present: string[] };
  export function stitchState(parts: Record<string, unknown>): Record<string, unknown>;
}
declare module "@stockroom/opencall.js" {
  export const OC_STAGES: Array<{ key: string; label?: string }>;
}
declare module "@stockroom/inventory.js" {
  export function deriveOnHand(state: Record<string, unknown>, book: Record<string, unknown>): number;
}
