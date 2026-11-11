// Types for the stockroom's hang tag sheet (apps/stockroom/src/lib/hang-tags.js).
declare module "@stockroom/hang-tags.js" {
  export const HANG_TAGS_PER_SHEET: number;
  export function hangTagsHtml(input: { books: Array<{ title: string; author?: string; price?: number | ""; currency?: string; isbn?: string }>; copies?: number; eventName?: string }): string;
}
