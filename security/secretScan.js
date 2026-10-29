// Looks for keys, tokens and private keys in the files git tracks (plan 13.1). The repository is public, and one leaked
// key on a platform reaches every shop. Plain Node, no packages. `findSecrets` is pure so a test can plant a fake key.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Each rule: a name and a pattern. Test keys in this repo are made-up words (`sk_test_fake`, `AIzaFake`), which none of
// these match because real keys have the right length and characters.
export const RULES = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: "Stripe live or restricted key", pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/ },
  { name: "Stripe webhook secret", pattern: /\bwhsec_[0-9A-Za-z]{24,}/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Google OAuth client secret", pattern: /\bGOCSPX-[0-9A-Za-z_-]{20,}/ },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36,}|\bgithub_pat_[0-9A-Za-z_]{40,}/ },
  { name: "Slack token", pattern: /\bxox[abprs]-[0-9A-Za-z-]{20,}/ },
  { name: "Resend API key", pattern: /\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{16,}/ },
  { name: "Square access token", pattern: /\bEAAA[0-9A-Za-z_-]{40,}/ },
  { name: "service account file", pattern: /"type"\s*:\s*"service_account"[\s\S]{0,400}"private_key"/ },
];

// A match that is plainly a made-up value (a test, practice or example key) is not a secret.
const MADE_UP = /test|fake|practice|example|dummy|0{6,}$/i;

// Firebase web keys are public by design (the page sends them to every visitor; App Check and referrer limits are what
// protect them). The platform's own two are allowed in the two files that must carry them, nowhere else.
export const ALLOWED = { "signup/config.js": ["Google API key"], "waitlist/config.js": ["Google API key"] };

/** Every rule that matches `text`, as `[{ rule, line }]` (the line is 1-based). The matched text itself is never returned. */
export function findSecrets(text) {
  const found = [];
  for (const { name, pattern } of RULES) {
    const all = new RegExp(pattern.source, "g");
    for (let m = all.exec(text); m; m = all.exec(text)) {
      if (MADE_UP.test(m[0])) continue;
      found.push({ rule: name, line: text.slice(0, m.index).split("\n").length });
      break;
    }
  }
  return found;
}

const SKIP_FILE = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.(?:png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip|mp4|svg)$/i;

/** The tracked files that hold something that looks like a secret: `[{ file, rule, line }]`. */
export function scanRepository({ root = ".", list = () => execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString("utf8").split("\0").filter(Boolean), read = (file) => readFileSync(`${root}/${file}`, "latin1") } = {}) {
  const hits = [];
  for (const file of list()) {
    if (SKIP_FILE.test(file)) continue;
    let text;
    try { text = read(file); } catch { continue; }
    for (const hit of findSecrets(text)) if (!ALLOWED[file]?.includes(hit.rule)) hits.push({ file, ...hit });
  }
  return hits;
}
