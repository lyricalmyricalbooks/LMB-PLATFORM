import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { forgetReports } from "./googleAnalytics";
import { clearShared } from "./overview/overviewShared";

// Connect Google (plan 6.17): one sign-in with the press's Google account links Analytics, search, Google Shopping and
// the shop's email for a shop run by Colophon. The platform's Google link does the work (functions/googleConnect.js →
// LMB-PLATFORM google/), and writes the measurement ID and property number into this shop's settings, where the tag
// (lib/ga4.ts, consent-aware) and the Overview's reports read them as before. A shop without the link answers
// "not_available", and the admin keeps its Google Analytics and Search Console cards.

export type GoogleExtra = "drive" | "youtube" | "calendar" | "businessProfile" | "ads";
export type GoogleStep = { step: string; state: "done" | "failed" | "waiting"; detail: string; at?: string };
export type GoogleStatus = {
  /** false: the link isn't switched on yet for any shop. */
  enabled: boolean;
  connected?: boolean;
  accountEmail?: string | null;
  connectedAt?: string | null;
  extrasOffered?: GoogleExtra[];
  extrasChosen?: GoogleExtra[];
  steps?: GoogleStep[];
};

/** Every part's name and one line about it, in the press's words. */
export const GOOGLE_PARTS: Record<string, { label: string; about: string }> = {
  firebase: { label: "Your shop", about: "Gets your shop ready for Google." },
  analytics: { label: "Google Analytics", about: "Counts visits, for visitors who agree to it, and shows Google's figures on your Overview." },
  domain: { label: "Your web address", about: "Your own address joins Google once it opens your shop." },
  searchConsole: { label: "Google search", about: "Tells Google about your shop and its books, and shows what people search for." },
  merchantCenter: { label: "Google Shopping", about: "Sends your books to Google Shopping's free listings each day." },
  email: { label: "Your emails", about: "Sends your shop's emails from your own address once it is ready." },
  drive: { label: "Backups to your Google Drive", about: "A copy of your shop each night, in a folder you own." },
  youtube: { label: "YouTube", about: "Pick book trailers from your channel for your book pages." },
  calendar: { label: "Google Calendar", about: "Launches and fairs from your calendar on your website's events." },
  businessProfile: { label: "Google Business Profile", about: "Your opening hours and shop link on Google Maps." },
  ads: { label: "Google Ads", about: "Lets you advertise your books. Nothing is spent unless you start an ad yourself." },
};

const TONE = { done: "success", waiting: "warning", failed: "danger" } as const;
export const stepTone = (state: GoogleStep["state"]) => TONE[state] ?? "neutral";
export const stepWord = (state: GoogleStep["state"]) => (state === "done" ? "Linked" : state === "waiting" ? "Waiting" : "Didn't work");

/** Reads the server's answer; anything unexpected becomes "not switched on" rather than a wrong promise. */
export function readGoogleStatus(answer: unknown): GoogleStatus {
  const a = (answer && typeof answer === "object" ? answer : {}) as Record<string, any>;
  if (a.enabled !== true) return { enabled: false };
  const extras = (list: unknown) => (Array.isArray(list) ? list.filter((e): e is GoogleExtra => typeof e === "string" && e in GOOGLE_PARTS) : []);
  return {
    enabled: true,
    connected: a.connected === true,
    accountEmail: typeof a.accountEmail === "string" ? a.accountEmail : null,
    connectedAt: typeof a.connectedAt === "string" ? a.connectedAt : null,
    extrasOffered: extras(a.extrasOffered),
    extrasChosen: extras(a.extrasChosen),
    steps: Array.isArray(a.steps)
      ? a.steps.filter((s: any) => s && typeof s.step === "string" && ["done", "failed", "waiting"].includes(s.state)).map((s: any) => ({ step: s.step, state: s.state, detail: String(s.detail ?? ""), at: s.at }))
      : [],
  };
}

/** What Google sent the press back with (`?google=connected|denied|failed`), then removed from the address. */
export function takeGoogleOutcome(): "connected" | "denied" | "failed" | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get("google");
  if (outcome !== "connected" && outcome !== "denied" && outcome !== "failed") return null;
  url.searchParams.delete("google");
  window.history.replaceState(window.history.state, "", url.toString());
  return outcome;
}

async function call(payload: Record<string, unknown>): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "googleConnect", ...payload }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "Couldn't reach Google just now."), { code: data?.code });
  return data;
}

// One status read shared by every card on the page (Overview prompt, Marketing, Settings), refreshed on change.
let shared: Promise<GoogleStatus | "not_available"> | null = null;
const listeners = new Set<() => void>();
function readShared(): Promise<GoogleStatus | "not_available"> {
  shared ??= call({ step: "status" }).then(readGoogleStatus, (err) => {
    if (err?.code === "not_available") return "not_available" as const;
    shared = null;
    throw err;
  });
  return shared;
}
function changed(next: GoogleStatus) {
  shared = Promise.resolve(next);
  // The Overview asks Google again: the shop now has (or no longer has) Google's figures.
  forgetReports(); clearShared();
  listeners.forEach((l) => l());
}

export const googleConnectApi = {
  status: readShared,
  /** Google's Allow page for this shop; the press comes back to `returnUrl` with `?google=…`. */
  connectLink: async (extras: GoogleExtra[], returnUrl = window.location.href): Promise<string> => (await call({ step: "connectLink", extras, returnUrl })).url,
  tryAgain: async (part: string) => { const next = readGoogleStatus(await call({ step: "tryAgain", part })); changed(next); return next; },
  disconnect: async () => { const next = readGoogleStatus(await call({ step: "disconnect" })); changed(next); return next; },
  /** Test hook. */
  __reset: () => { shared = null; },
};

/**
 * The shared status for a card. `mode`: "loading"; "own" for a shop not run by Colophon (it keeps the older Google
 * Analytics and Search Console cards); "platform" for a Colophon shop (`status.enabled` false until the link is
 * switched on: the older cards stay hidden and the Overview keeps the shop's own counts); "error" when it couldn't be read.
 */
export function useGoogleConnect() {
  const [state, setState] = useState<{ mode: "loading" | "own" | "platform" | "error"; status: GoogleStatus | null; error: string | null }>({ mode: "loading", status: null, error: null });
  const load = () => {
    setState((s) => (s.mode === "error" ? { mode: "loading", status: null, error: null } : s));
    readShared().then(
      (answer) => setState(answer === "not_available" ? { mode: "own", status: null, error: null } : { mode: "platform", status: answer, error: null }),
      (err) => setState({ mode: "error", status: null, error: err?.message || "Couldn't read your Google connection." }),
    );
  };
  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => { shared = null; load(); } };
}
