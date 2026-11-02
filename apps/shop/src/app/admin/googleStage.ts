// Get started, step 4: Google in one sign-in (plan 17.9). Pure: the marker the step records, and the plain line for each
// part Google linked. The connect itself is googleConnect.ts (plan 6.17). While Google hasn't approved the sign-in for
// Colophon shops, the step says it is coming and doesn't hold the run up.

/** What the step records once it is finished (firstWeek/start › google). */
export interface GoogleMarker {
  at: string;
  /** Google linked for this shop. */
  connected?: boolean;
  /** The connect isn't switched on yet (Google hasn't approved the sign-in); the press carries on and is reminded later. */
  coming?: boolean;
  /** The press chose to connect later. */
  skipped?: boolean;
}

export type GooglePartLine = { label: string; state: "done" | "failed" | "waiting"; word: string };

/** The parts Google reported, in plain words, in the order the connect runs them. `labels` maps part ids to the press's words. */
export function googlePartLines(steps: { step: string; state: "done" | "failed" | "waiting" }[], labels: Record<string, { label: string }>): GooglePartLine[] {
  return steps.map(s => ({
    label: labels[s.step]?.label || "Part of your Google connection",
    state: s.state,
    word: s.state === "done" ? "Linked" : s.state === "waiting" ? "Waiting" : "Didn't work",
  }));
}
