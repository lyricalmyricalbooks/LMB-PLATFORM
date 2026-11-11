// Stockroom › Open call, worked out inside the admin from the stockroom's own pipeline rules (opencall.js): where each
// contributor is, whose move it is and who has been waiting longest. Pure and read-only: the page is OpenCallPage.tsx.
import { OC_STAGES, ocCurrentStage, ocNextAction, ocNudgeDue, ocProblems, ocStageStates, ocWaitingDays, ocWhoseMove } from "@stockroom/opencall.js";

import type { StockroomRecords } from "./stockroomData";

type Rec = Record<string, any>;

export type Move = "you" | "artist" | "blocked" | "done";
export type Contributor = {
  key: string; name: string; email: string; stage: string; stageLabel: string; stages: Array<{ key: string; label: string; state: "done" | "you" | "artist" | "todo" }>;
  done: number; move: Move; next: string; waitingDays: number | null; nudge: boolean; problems: string[];
};
export type OpenCallItem = { bookId: string; title: string; contributors: Contributor[]; counts: Record<Move, number> };
export type OpenCallView = { items: OpenCallItem[]; total: number; counts: Record<Move, number>; nudge: number; problems: number };

export const PROBLEM_WORDS: Record<string, string> = {
  noEmail: "No email address",
  bounced: "Their email bounced",
  unsubscribed: "Unsubscribed from email",
  noThread: "No email thread to reply in",
};
export const MOVE_WORDS: Record<Move, string> = { you: "Your move", artist: "Waiting on them", blocked: "Can't email", done: "Finished" };

const blank = (): Record<Move, number> => ({ you: 0, artist: 0, blocked: 0, done: 0 });

export function buildOpenCall(records: StockroomRecords, now: Date = new Date()): OpenCallView {
  const t = now.getTime();
  const counts = blank();
  let nudge = 0, problems = 0, total = 0;
  const items: OpenCallItem[] = [];
  for (const book of records.books) {
    const list = records.states[book.id]?.openCall;
    if (!Array.isArray(list) || !list.length) continue;
    const itemCounts = blank();
    const contributors: Contributor[] = list.filter((c: Rec) => c && typeof c === "object").map((c: Rec, i: number) => {
      const stage = ocCurrentStage(c);
      const states = ocStageStates(c);
      const move = ocWhoseMove(c);
      const found = ocProblems(c);
      const nudgeDue = ocNudgeDue(c, t);
      itemCounts[move]++;
      counts[move]++;
      if (nudgeDue) nudge++;
      if (found.length) problems++;
      total++;
      return {
        key: String(c.id || `${book.id}:${i}`), name: String(c.creditName || c.name || c.email || "Unnamed"), email: String(c.email || ""),
        stage, stageLabel: OC_STAGES.find((s) => s.key === stage)?.label ?? "All done",
        stages: OC_STAGES.map((s: { key: string; label?: string }, n: number) => ({ key: s.key, label: s.label || s.key, state: states[n] })),
        done: OC_STAGES.filter((s: { key: string }) => c[s.key]).length, move, next: ocNextAction(c) || "", waitingDays: move === "done" ? null : ocWaitingDays(c, t),
        nudge: nudgeDue, problems: found,
      };
    });
    // Longest waiting first, finished last.
    contributors.sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1));
    items.push({ bookId: book.id, title: book.title || book.id, contributors, counts: itemCounts });
  }
  return { items, total, counts, nudge, problems };
}
