import { useSyncExternalStore } from "react";

/**
 * Home shows one first step at a time (simpler admin, change 3): Get started, then the setup guide, then the tour
 * offer, then Connect Google. SetupStart says here whether it is showing something; the tour offer (Dashboard) and the
 * Connect Google prompt (HomePage) wait while it is. `null` = not known yet (Home hasn't read the setup steps).
 */
let setupShowing: boolean | null = null;
const listeners = new Set<() => void>();

export function setSetupShowing(on: boolean | null) {
  if (setupShowing === on) return;
  setupShowing = on;
  listeners.forEach((l) => l());
}

export function getSetupShowing() { return setupShowing; }

export function useSetupShowing(): boolean | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, getSetupShowing, getSetupShowing);
}

/** Which first step Home shows: the setup steps first, then the tour offer, then Connect Google. */
export function firstStepNow(setup: boolean | null, tourWaiting: boolean): "setup" | "tour" | "google" | "wait" {
  if (setup === null) return "wait";
  if (setup) return "setup";
  return tourWaiting ? "tour" : "google";
}

/**
 * How many steps the one list on Home has left before the shop opens (sign-up to open shop plan, move 4), so the top
 * bar's Open button counts what the list shows. `null` when there is no run (the bar then counts Ready to sell's
 * blockers, as before).
 */
let runLeft: number | null = null;
const runListeners = new Set<() => void>();

export function setRunLeft(n: number | null) {
  if (runLeft === n) return;
  runLeft = n;
  runListeners.forEach((l) => l());
}

export function getRunLeft() { return runLeft; }

export function useRunLeft(): number | null {
  return useSyncExternalStore((l) => { runListeners.add(l); return () => { runListeners.delete(l); }; }, getRunLeft, getRunLeft);
}
