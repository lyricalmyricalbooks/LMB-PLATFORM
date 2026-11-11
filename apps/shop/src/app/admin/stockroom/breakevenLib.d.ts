// Types for the stockroom's break-even rule that the Stock page imports through `@stockroom` (apps/stockroom/src/lib/breakeven.js).
declare module "@stockroom/breakeven.js" {
  export function calculateBreakEven(input: { cost?: number; recognizedRev?: number; listPrice?: number; sold?: number; stock?: number; currency?: string }): {
    broken: boolean; pctBe: number; remaining: number; hasListPrice: boolean; listPrice: number; unitsNeededAtList: number; avgRev: number;
    unitsNeededAtAvg: number; stockDeficit: number; primaryExplanation: string; paceNote: string; stockNote: string;
  };
}
