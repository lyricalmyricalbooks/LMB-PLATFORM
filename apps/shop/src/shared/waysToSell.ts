// Ways to sell (beta): six more things any shop can sell beside its products or its bookings (events, classes, digital
// goods, donations, memberships, rentals). They are switches, not kinds of shop. The platform's copy of this file is
// shared/ways/ways.js (its ways.test.js keeps the two in step).
//
// Two switches decide whether a shop has a way: the platform's (`platform/features` › `ways`, written only by the
// control room) and the owner's (Settings › General › Ways to sell, `firstWeek/start` › `ways`). A way is on only while
// both are. Every way is marked Beta.

export type WayId = "events" | "classes" | "digital" | "giving" | "memberships" | "rentals";
export type Way = { id: WayId; label: string; line: string };

/** The six ways, in the order they are shown. */
export const WAYS: readonly Way[] = [
  { id: "events", label: "Events & tickets", line: "Sell tickets to a launch, a show or a market day." },
  { id: "classes", label: "Classes & workshops", line: "Take sign-ups for a class, a course or a workshop." },
  { id: "digital", label: "Digital goods", line: "Sell files people download: patterns, presets, e-books, music." },
  { id: "giving", label: "Donations & tips", line: "Take donations and tips, and show a fundraising goal." },
  { id: "memberships", label: "Memberships & subscriptions", line: "Bill members or subscribers every month or year." },
  { id: "rentals", label: "Rentals", line: "Rent things out by the day, with a deposit." },
];

export const WAY_IDS: readonly WayId[] = WAYS.map((way) => way.id);

type WaysMap = Partial<Record<string, unknown>> | null | undefined;

/** The ids switched on in a saved `ways` map ({ events: true }), in the ways' own order; anything else is left out. */
export function waysIn(map: WaysMap): WayId[] {
  return map && typeof map === "object" ? WAY_IDS.filter((id) => map[id] === true) : [];
}

/** The ways the platform lets this shop use: what its `platform/features` says. */
export function waysAllowed(features: { ways?: WaysMap } | null | undefined): WayId[] {
  return waysIn(features?.ways);
}

/** The ways on for a shop: allowed by the platform and switched on by the owner. */
export function waysOn(features: { ways?: WaysMap } | null | undefined, start: { ways?: WaysMap } | null | undefined): WayId[] {
  const chosen = waysIn(start?.ways);
  return waysAllowed(features).filter((id) => chosen.includes(id));
}
