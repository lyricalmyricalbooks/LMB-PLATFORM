// Checks the live platform site after a deploy: every page answers with its own page (not Hosting's "Page not found"),
// and when the server is live, the plans door answers too. Reads only.
//
//   node site/check-live.js https://lmb-platform-prod.web.app
import { pathToFileURL } from "node:url";

/** Each address and a piece of text its page must hold. */
export const LIVE_PAGES = Object.freeze([
  ["/", "Colophon"],
  ["/join/", "Start your shop"],
  ["/signup/", "Colophon"],
  ["/account/", "Your shops"],
  ["/account/billing", "Plan &amp; billing"],
  ["/help/", "Colophon help"],
  ["/terms/", "Colophon terms"],
  ["/trust/", "Colophon"],
  ["/status/", "Colophon status"],
  ["/control/", "Control room"],
  ["/app/", "<div id=\"root\">"],
]);

/** Returns the lines of the report and whether everything passed. `fetch` is passed in for the tests. */
export async function checkLive(base, { fetch = globalThis.fetch, pages = LIVE_PAGES } = {}) {
  const lines = [];
  let ok = true;
  for (const [path, words] of pages) {
    let line;
    try {
      const answer = await fetch(new URL(path, base), { redirect: "follow" });
      const text = await answer.text();
      const good = answer.status === 200 && text.includes(words);
      ok &&= good;
      line = `${good ? "ok  " : "FAIL"} ${path} (${answer.status}${good ? "" : `, expected "${words}"`})`;
    } catch (error) {
      ok = false;
      line = `FAIL ${path} (${error.message})`;
    }
    lines.push(line);
  }
  const plans = await fetch(new URL("/api/plans", base)).catch(() => null);
  if (plans && plans.status === 200 && /json/.test(plans.headers.get("content-type") ?? "")) lines.push("ok   /api/plans (the server is live)");
  else lines.push(`--   /api/plans (the server isn't live yet${plans ? `: ${plans.status}` : ""})`);
  return { ok, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? "https://lmb-platform-prod.web.app";
  // A fresh Hosting release can take a few seconds to reach every edge: try three times.
  let result;
  for (let tries = 0; tries < 3; tries++) {
    result = await checkLive(base);
    if (result.ok) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log(result.lines.join("\n"));
  process.exitCode = result.ok ? 0 : 1;
}
