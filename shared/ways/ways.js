// Ways to sell (beta, 17 November 2026; tasks/todo/2026-11-17-ways-to-sell-switches.md): six more things any shop can
// sell beside its products or its bookings. They are switches, not kinds of shop: a bookshop can sell tickets to a
// launch, a studio can sell a membership. Every one is marked Beta until Julian says otherwise.
//
// Two switches decide whether a shop has a way:
//   1. the platform's, in the control room (control-room/waysBeta.js), kept in the shop's own folder as
//      `platform/features` { ways: { events: true } } beside Bookings' switch, where only the platform can write;
//   2. the owner's, in Settings › General › Ways to sell, kept as `firstWeek/start` { ways: { events: true } }.
// A way is on for a shop only while both are (`waysOn`). The shop's copy of this file is
// apps/shop/src/shared/waysToSell.ts (ways.test.js keeps the two in step).
//
// `built` says the way's own pages exist. The control room refuses to turn on a way that isn't built, so no shop is
// ever shown a switch that does nothing; each way's first pull request sets it to true.

/** The six ways, in the order they are built and shown. */
export const WAYS = Object.freeze([
  Object.freeze({ id: "events", label: "Events & tickets", line: "Sell tickets to a launch, a show or a market day.", built: true }),
  Object.freeze({ id: "classes", label: "Classes & workshops", line: "Take sign-ups for a class, a course or a workshop.", built: true }),
  Object.freeze({ id: "digital", label: "Digital goods", line: "Sell files people download: patterns, presets, e-books, music.", built: true }),
  Object.freeze({ id: "giving", label: "Donations & tips", line: "Take donations and tips, and show a fundraising goal.", built: true }),
  Object.freeze({ id: "memberships", label: "Memberships & subscriptions", line: "Bill members or subscribers every month or year.", built: true }),
  Object.freeze({ id: "rentals", label: "Rentals", line: "Rent things out by the day, with a deposit.", built: false }),
]);

export const WAY_IDS = Object.freeze(WAYS.map((way) => way.id));

/** The way with that id, or null. */
export const wayOf = (id) => WAYS.find((way) => way.id === id) ?? null;

/** The ids switched on in a saved `ways` map ({ events: true }), in the ways' own order; anything else is left out. */
export function waysIn(map) {
  return map && typeof map === "object" ? WAY_IDS.filter((id) => map[id] === true) : [];
}

/** The ways the platform lets this shop use: what its `platform/features` says. */
export const waysAllowed = (features) => waysIn(features?.ways);

/** The ways on for a shop: allowed by the platform and switched on by the owner. */
export function waysOn(features, start) {
  const chosen = waysIn(start?.ways);
  return waysAllowed(features).filter((id) => chosen.includes(id));
}
