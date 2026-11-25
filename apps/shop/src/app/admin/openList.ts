// The one list on Home (sign-up to open shop plan, move 4): what a new shop has done and what is left before it opens,
// in one card. It replaces Get started's step strip and is read from the same run (startRun.ts decides the order; this
// file only names the rows). The first two rows are always done: the account and the name were made at sign-up.
// The contact step and shipping read as one row, "Delivery and contact", since both are about reaching customers.

import type { RunStep } from "./startRun";

export type OpenRowId = "account" | "name" | "look" | "bring" | "services" | "payments" | "delivery";
export type OpenRowState = "done" | "now" | "next";

export interface OpenRow {
  id: OpenRowId;
  state: OpenRowState;
  title: string;
  detail: string;
}

export interface OpenFacts {
  email?: string | null;
  name?: string | null;
  country?: string | null;
  /** The theme id the look step saved (welcome.theme), and its style when sign-up chose one. */
  look?: string | null;
  lookStyle?: string | null;
  provider?: "stripe" | "square" | null;
}

/** "press-marquee" → "Marquee", "aurel" → "Aurel": a look's id read as its name. */
export function lookName(id?: string | null): string {
  const last = String(id ?? "").trim().split(/[-_]/).filter(Boolean).pop() ?? "";
  return last ? last[0].toUpperCase() + last.slice(1) : "";
}

const rowOf = (step: RunStep): OpenRowId | null =>
  step === "details" || step === "shipping" ? "delivery" : step === "final" ? null : step;

/** The rows in order, each done, the one to do now, or still to come. `step` null means the run is over. */
export function openRows(steps: RunStep[], step: RunStep | null, facts: OpenFacts = {}): OpenRow[] {
  const at = step ? steps.indexOf(step) : steps.length;
  const ids: OpenRowId[] = [];
  for (const s of steps) { const id = rowOf(s); if (id && !ids.includes(id)) ids.push(id); }
  const stateOf = (id: OpenRowId): OpenRowState => {
    const members = steps.map((s, i) => ({ s, i })).filter(({ s }) => rowOf(s) === id);
    if (members.some(({ i }) => i === at)) return "now";
    return members.every(({ i }) => i < at) ? "done" : "next";
  };
  const shipping = steps.includes("shipping");
  const look = lookName(facts.look);
  const style = lookName(facts.lookStyle);
  const words: Record<OpenRowId, (state: OpenRowState) => [string, string]> = {
    account: () => ["Made your account", facts.email ? `Signed in as ${facts.email}` : "You're signed in."],
    name: () => ["Named your shop", [facts.name, facts.country].filter(Boolean).join(" · ") || "Change it anytime in Settings."],
    look: (s) => s === "done"
      ? ["Picked a starting look", `${look || "Your look"}${style ? `, in ${style}` : ""}. Make it yours whenever you like.`]
      : ["Pick a starting look", "Keep the look you saw at sign-up, or try another. You can change it anytime."],
    bring: (s) => s === "done"
      ? ["Added your books", "Add more anytime from Books."]
      : ["Add your books", "Bring them from a file or start with one. The sample books step aside when yours arrive."],
    services: (s) => s === "done"
      ? ["Added your services", "Add more anytime from Bookings."]
      : ["Add your services", "What clients can book, how long it takes and the price."],
    payments: (s) => s === "done"
      ? ["Set up getting paid", "Card payments go to your bank."]
      : ["Get paid", `Connect ${facts.provider === "square" ? "Square" : "Stripe"} so card payments reach your bank. About 5 minutes.`],
    delivery: (s) => s === "done"
      ? [shipping ? "Delivery and contact" : "Contact details", "Customers know how to reach you."]
      : shipping
        ? ["Delivery and contact", "Where customers reach you, and how orders get to them. We filled in rates you can check."]
        : ["Contact details", "Where clients reach you, shown on your shop and in your emails."],
  };
  const all: OpenRowId[] = ["account", "name", ...ids];
  return all.map((id) => {
    const state: OpenRowState = id === "account" || id === "name" ? "done" : stateOf(id);
    const [title, detail] = words[id](state);
    return { id, state, title, detail };
  });
}

/** How many rows are left, the one being done now included: the header's "N steps to open" and the top bar's count. */
export function rowsLeft(rows: OpenRow[]): number {
  return rows.filter((r) => r.state !== "done").length;
}
