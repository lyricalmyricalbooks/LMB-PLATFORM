// Types for the stockroom's letterhead (apps/stockroom/src/lib/letterhead.js), imported through `@stockroom`.
declare module "@stockroom/letterhead.js" {
  export type Letterhead = {
    name: string; address: string; email: string; website: string; phone: string; recipient: string; date: string; subject: string;
    body: string; signoff: string; signature: string; accent: string; logo: string; bodyHtml: string;
  };
  export function normalizeLetterhead(saved?: Record<string, unknown>, invoice?: Record<string, unknown>): Letterhead;
  export function renderLetterhead(letter: Partial<Letterhead>): string;
}
