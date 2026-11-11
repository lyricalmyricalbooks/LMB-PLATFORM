// Types for the stockroom's stock-counts file (another shop system's layout) the Backups page imports.
declare module "@stockroom/stock-locations.js" {
  export function stockLocationsCsv(entries: { book: unknown; state: unknown }[], opts?: { location?: string }): string;
}
