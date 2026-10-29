// The walkthrough's platform emails: the real templates, into the practice inbox, never to an email sender.
import { test } from "node:test";
import assert from "node:assert/strict";
import { practicePlatformEmail } from "./practiceEmail.js";

const registry = { getShop: async () => null };

test("a platform email is written from its real template into the practice inbox, once per key", async () => {
  const email = practicePlatformEmail({ registry });
  const message = { kind: "waitlist-invite", to: "newcomer@example.com", data: { link: "https://colophon.example/signup/" }, idempotencyKey: "waitlist-invite/1" };
  await email.sendPlatform(message);
  await email.sendPlatform(message);
  assert.equal(email.list().length, 1);
  const [sent] = email.inbox.all();
  assert.equal(email.inbox.all().length, 1);
  assert.deepEqual(sent.to, ["newcomer@example.com"]);
  assert.match(sent.html, /colophon\.example\/signup/);
  assert.ok(sent.subject.length > 0);
});

test("a kind with no template is still recorded, and nothing is thrown", async () => {
  const notes = [];
  const email = practicePlatformEmail({ registry, log: (line) => notes.push(line) });
  await email.sendPlatform({ kind: "no-such-email", to: "a@example.com", idempotencyKey: "k" });
  assert.equal(email.list().length, 1);
  assert.equal(email.inbox.all().length, 0);
  assert.match(notes[0], /no-such-email/);
});
