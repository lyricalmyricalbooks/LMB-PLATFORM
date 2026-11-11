import { RUN_LABELS, type RunStep } from "../startRun";

/**
 * Get started's progress strip (11 November 2026 redesign): where the press is in the run, by name. Desktop shows every
 * step as a pill (ticked, the current one in ink, the rest waiting); a phone shows "Step N of M", the step's name and a
 * bar. `steps` comes from `runSteps`, so a press on its own card keys never counts a Get paid step it won't see.
 */
export function RunProgress({ step, steps }: { step: RunStep; steps: RunStep[] }) {
  const at = Math.max(0, steps.indexOf(step));
  const total = steps.length;
  return (
    <nav className="rp-run" aria-label="Get started">
      <div className="rp-run-head">
        <span className="rp-run-kicker">Get started</span>
        <span className="rp-run-count">Step {at + 1} of {total}<span className="rp-run-now"> · {RUN_LABELS[step]}</span></span>
      </div>
      <div className="rp-run-bar" role="progressbar" aria-label="Get started progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={at}>
        <span style={{ width: `${Math.round((at / total) * 100)}%` }} />
      </div>
      <ol className="rp-run-steps">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li key={s} data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="rp-run-dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
              <span>{RUN_LABELS[s]}{state === "done" && <span className="rp-sr-only"> (done)</span>}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
