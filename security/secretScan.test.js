import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecrets, scanRepository } from "./secretScan.js";

// Fake keys are built from parts so this file doesn't trip its own scan.
const fake = {
  stripe: "sk_" + "live_" + "a1B2c3D4e5F6g7H8i9J0",
  google: "AIza" + "Sy" + "A".repeat(33),
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  github: "ghp_" + "a".repeat(36),
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----",
  slack: "xoxb-" + "1234567890-abcdefghij",
};

test("each kind of planted fake key is found, with its line and never its text", () => {
  for (const [kind, value] of Object.entries(fake)) {
    const hits = findSecrets(`line one\nconst key = "${value}";\n`);
    assert.equal(hits.length, 1, kind);
    assert.equal(hits[0].line, 2, kind);
    assert.ok(!JSON.stringify(hits).includes(value.slice(6)), `${kind}: the result must not hold the key`);
  }
});

test("test placeholders and ordinary text are not flagged", () => {
  const text = 'const stripe = "sk_test_fake"; const g = "AIzaFake"; // whsec_example, re_test\nAKIA is a prefix.';
  assert.deepEqual(findSecrets(text), []);
});

test("a scan of a pretend repository reports the file that holds a key", () => {
  const files = { "a.js": `x = "${fake.stripe}"`, "b.js": "nothing here", "package-lock.json": `"${fake.github}"` };
  const hits = scanRepository({ list: () => Object.keys(files), read: (file) => files[file] });
  assert.deepEqual(hits.map((h) => [h.file, h.rule]), [["a.js", "Stripe live or restricted key"]]);
});

test("this repository holds no key, token or private key", () => {
  assert.deepEqual(scanRepository(), []);
});
