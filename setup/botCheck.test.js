import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TOKEN_MINUTES, botCheckStep, tokenMinutesOf } from "./botCheck.js";
import { fakeGoogle } from "./fakes.js";

const P = "lmb-test-shop";
const shop = { shopId: P };
function world() {
  const google = fakeGoogle();
  google.world.apps.set(P, [{ appId: "1:1:web:a", displayName: "Shop" }]);
  return google;
}

test("the token lifetime is set once on a shop that has a bot check, and a re-run changes nothing", async () => {
  const google = world();
  google.world.appCheckMinutes.set(P, 60);
  const step = botCheckStep({ google, config: {} });
  assert.equal(await step.check({ shop }), false);
  await step.act({ shop });
  assert.equal(google.world.appCheckMinutes.get(P), DEFAULT_TOKEN_MINUTES);
  assert.equal(await step.check({ shop }), true);
  const before = google.calls.length;
  await step.act({ shop });
  assert.equal(google.calls.length, before);
});

test("a shop with no bot check configuration yet has nothing to set", async () => {
  const google = world();
  const step = botCheckStep({ google, config: {} });
  assert.equal(await step.check({ shop }), true);
  await step.act({ shop });
  assert.equal(google.world.appCheckMinutes.has(P), false);
});

test("the lifetime comes from the platform's settings and must be what Google allows", () => {
  assert.equal(tokenMinutesOf({ appCheckTokenMinutes: 240 }), 240);
  assert.equal(tokenMinutesOf({}), 720);
  assert.throws(() => tokenMinutesOf({ appCheckTokenMinutes: 10 }), /30 to 10080/);
  assert.throws(() => tokenMinutesOf({ appCheckTokenMinutes: 20000 }), /30 to 10080/);
});
