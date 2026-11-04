// What the shop sells (plan 12.14, 4 November 2026): when firstWeek/start changes, the answer (Settings › What you sell,
// else the sign-up answer) is copied to the public settings/website `sells`, where the storefront reads it
// (src/app/admin/sells.ts withShopWordsFor), and, when it changed, to the stockroom's words.

/** The shop's current answer in a firstWeek/start doc, or "" when there is none. */
function sellsAnswer(doc) {
  const answer = doc?.sells || doc?.publishes;
  return typeof answer === "string" ? answer : "";
}

/**
 * Copies the answer where it is needed. `readWebsiteSells`, `writeWebsiteSells` and `writeStockroomWords` are the
 * Firestore steps (index.js), passed in so the rule is tested without Firebase. A failed step is logged, never thrown,
 * so one side never stops the other. A shop made before the copy existed gets it the next time the doc changes.
 */
async function syncSells({ before, after, readWebsiteSells, writeWebsiteSells, writeStockroomWords, warn = console.warn }) {
  const answer = sellsAnswer(after);
  if (!answer) return { website: false, stockroom: false };
  const changed = answer !== sellsAnswer(before);
  let website = false;
  try {
    if (changed || (await readWebsiteSells()) !== answer) { await writeWebsiteSells(answer); website = true; }
  } catch (err) {
    warn("Couldn't copy what the shop sells to the shop's words:", err?.message || err);
  }
  if (!changed) return { website, stockroom: false };
  try {
    await writeStockroomWords(answer);
    return { website, stockroom: true };
  } catch (err) {
    warn("Couldn't copy what the shop sells to the stockroom:", err?.message || err);
    return { website, stockroom: false };
  }
}

module.exports = { sellsAnswer, syncSells };
