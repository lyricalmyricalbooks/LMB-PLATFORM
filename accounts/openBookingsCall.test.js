// The shop admin's "open-bookings" call (shop types plan, part 3): only there when the door is given `openBookings`,
// and it passes the signed-in owner's email on, so the shop's audit log says who changed the type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingCalls } from "./billingRoutes.js";

test("open-bookings is offered only with openBookings, and names the owner", async () => {
  assert.equal(billingCalls({ billing: {}, settings: {} })["open-bookings"], undefined);
  const asked = [];
  const calls = billingCalls({ billing: {}, settings: {}, openBookings: async (shopId, by) => { asked.push([shopId, by]); return { on: true, changed: true }; } });
  assert.deepEqual(await calls["open-bookings"].run("s1", {}, { claims: { email: "owner@example.com" } }), { on: true, changed: true });
  assert.deepEqual(asked, [["s1", "owner@example.com"]]);
  assert.ok(!calls["open-bookings"].secondStep, "turning services on is not a paid-plan change");
});
