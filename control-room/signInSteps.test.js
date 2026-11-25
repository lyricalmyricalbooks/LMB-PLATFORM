// The control room's sign-in words (signInSteps.js): each failure says what happened and what to do next.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCode, codeProblem, googleProblem, roomRefusal } from "./signInSteps.js";

test("a typed or pasted code is cleaned to 6 digits", () => {
  assert.equal(cleanCode("123456"), "123456");
  assert.equal(cleanCode(" 123 456 "), "123456");
  assert.equal(cleanCode("123-456"), "123456");
  assert.equal(cleanCode("12345"), null);
  assert.equal(cleanCode("1234567"), null);
  assert.equal(cleanCode("12a456"), null);
  assert.equal(cleanCode(undefined), null);
});

test("a wrong code stays on the code step; a timed-out step goes back to Google", () => {
  assert.deepEqual(codeProblem("auth/invalid-verification-code").restart, false);
  assert.match(codeProblem("auth/invalid-verification-code").words, /didn't match/);
  for (const code of ["auth/code-expired", "auth/missing-multi-factor-session", "auth/invalid-multi-factor-session", "auth/multi-factor-info-not-found"]) {
    assert.equal(codeProblem(code).restart, true, code);
    assert.match(codeProblem(code).words, /Sign in with Google again/);
  }
  assert.match(codeProblem("auth/too-many-requests").words, /Wait a minute/);
  assert.match(codeProblem("auth/network-request-failed").words, /connection/);
  assert.equal(codeProblem("auth/something-new").restart, false);
});

test("closing the Google window says nothing; a blocked one says how to fix it", () => {
  assert.equal(googleProblem("auth/popup-closed-by-user"), null);
  assert.equal(googleProblem("auth/cancelled-popup-request"), null);
  assert.match(googleProblem("auth/popup-blocked"), /pop-ups/);
  assert.match(googleProblem("auth/whatever"), /didn't finish/);
});

test("the room's refusals turn into the right sign-in screen", () => {
  const twoStep = "The control room needs two-step sign-in: a code from your authenticator app each time you sign in. Set it up, then sign in again.";
  assert.deepEqual(roomRefusal(twoStep, false), { show: "setup" });
  assert.equal(roomRefusal(twoStep, true).show, "signin");
  assert.match(roomRefusal("Your control-room sign-in is more than 12 hours old. Sign in again.", true).words, /12 hours/);
  assert.match(roomRefusal("The control room is for platform admins only.", false).words, /isn't a control-room account/);
  assert.equal(roomRefusal("The platform didn't answer. Try again.", true), null);
});

test("no technical words reach the person", () => {
  const all = [
    ...["auth/invalid-verification-code", "auth/code-expired", "auth/too-many-requests", "auth/network-request-failed", "x"].map((c) => codeProblem(c).words),
    ...["auth/popup-blocked", "auth/network-request-failed", "auth/too-many-requests", "auth/unauthorized-domain", "x"].map(googleProblem),
  ];
  for (const words of all) assert.doesNotMatch(words, /auth\/|firebase|token|MFA|TOTP|session/i, words);
});
