export type AppUpdate = {
  id: string;
  date: string;
  title: string;
  summary: string;
  /** `studio` (a `#designer?…` link, see studio/studioLocation.ts) opens the Design studio at that page/tool. */
  links: Array<{ label: string; tab: string; settingsTab?: string; studio?: string }>;
};

// One release note per file in ./updates, named `YYYY-MM-DD-NN-<id>.ts` (NN counts up within a day, so the
// newest note of the day has the highest number). Every PR adds its own file instead of editing a shared list,
// so PRs merged in any order never conflict here. Newest first; links open the affected admin workspace.
const files = import.meta.glob<AppUpdate>("./updates/*.ts", { eager: true, import: "default" });

/** Release-note file paths newest first (date, then the day's number). */
export function updateOrder(paths: string[]): string[] {
  return [...paths].sort((a, b) => b.localeCompare(a));
}

export const APP_UPDATES: AppUpdate[] = updateOrder(Object.keys(files)).map(path => files[path]);
