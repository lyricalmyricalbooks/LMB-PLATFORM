// The plain-words rule (code plan 6.16): nothing technical reaches a press. `banned.json` is the one list, read by this
// folder's test, the shop's admin test and the stockroom's test. A plain, non-technical use of a listed word (a
// "Resend email" button, "arrow keys") is allowed only by an `allowed` phrase given to `findBanned` by the checking
// test, each with a comment saying why. The list itself is never weakened.
import { readFileSync } from "node:fs";

const { banned } = JSON.parse(readFileSync(new URL("./banned.json", import.meta.url), "utf8"));

export const BANNED = Object.freeze(banned.map(({ word, pattern, flags }) => Object.freeze({ word, regex: new RegExp(pattern, flags) })));

/** Words a press would see in plain text: tags, scripts and styles gone, entities turned back, spaces squeezed. */
export function visibleText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // The words in an attribute a press can read or hear: labels, placeholders, titles, alternative text.
    .replace(/<[^>]*>/g, (tag) => [...tag.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/gi)].map((m) => ` ${m[1]} `).join(""))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Each banned word found in `text`, with a little of the sentence around it. `allowed`: phrases that may stay. */
export function findBanned(text, allowed = []) {
  let rest = String(text);
  for (const phrase of allowed) rest = rest.split(phrase).join(" ");
  const found = [];
  for (const { word, regex } of BANNED) {
    const match = regex.exec(rest);
    if (match) found.push(`${word}: “…${rest.slice(Math.max(0, match.index - 40), match.index + 50).replace(/\s+/g, " ")}…”`);
  }
  return found;
}

// A string that is code, not words: a web address, a file name, or one lower-case token such as "click" or "x-device-id".
const NOT_WORDS = /^(?:[a-z]+:\/\/\S*|[\w./$#:@-]+\.(?:js|css|html|json|png|svg)|[a-z0-9_.:/#@$-]+)$/;

/**
 * The sentences in a piece of browser or server JavaScript: its quoted and template strings that read like words (a
 * space in them, or a capital first letter), skipping comments. Not a parser; enough for the platform's small plain pages.
 */
export function sentencesIn(source) {
  const out = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") { while (i < n && source[i] !== "\n") i += 1; continue; }
    if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let text = "";
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") { text += source[i + 1] ?? ""; i += 2; continue; }
        if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
          // A template's hole: keep the words around it; strings inside the hole are found on their own.
          let depth = 1;
          const start = i + 2;
          i = start;
          while (i < n && depth > 0) { if (source[i] === "{") depth += 1; else if (source[i] === "}") depth -= 1; i += 1; }
          out.push(...sentencesIn(source.slice(start, i - 1)));
          text += " ";
          continue;
        }
        text += source[i];
        i += 1;
      }
      i += 1;
      const t = text.trim();
      if (t && (/\s/.test(t) || /^[A-Z]/.test(t)) && !NOT_WORDS.test(t)) out.push(t);
      continue;
    }
    i += 1;
  }
  return out;
}
