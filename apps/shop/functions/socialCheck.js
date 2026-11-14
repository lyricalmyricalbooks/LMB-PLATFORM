// Settings › General › Social media › Check my links: does each saved account still have a page? The browser can't ask
// another site, so the server looks, with the old-shop reader's careful fetch (moving/safeFetch.mjs: public https
// names only, redirects checked hop by hop, 15 seconds). Only a clear "no such page" (404 or 410) counts as missing:
// many networks answer a sign-in wall for real pages, so anything else is "we couldn't tell", never "broken".
// Admin only, sharing the old-shop rate limit. Nothing is saved.
"use strict";
const { readSocialInput, SOCIAL_KEYS } = require("./shared/socialLinks");

const getStatus = async (url) => (await import("./moving/safeFetch.mjs")).getPublicStatus(url);

/** "ok", "missing" (the site says no such page) or "unknown" (blocked, timed out, a sign-in wall). */
function verdict(status) {
  if (status === 404 || status === 410) return "missing";
  if (status >= 200 && status < 400) return "ok";
  return "unknown";
}

async function checkSocialLinks(links, { status = getStatus } = {}) {
  const results = {};
  const entries = Object.entries(links && typeof links === "object" ? links : {})
    .filter(([key]) => SOCIAL_KEYS.includes(key)).slice(0, SOCIAL_KEYS.length);
  await Promise.all(entries.map(async ([key, value]) => {
    const { url } = readSocialInput(key, value);
    if (!url) { results[key] = "unknown"; return; }
    try { results[key] = verdict(await status(url)); } catch { results[key] = "unknown"; }
  }));
  return results;
}

async function handleSocialCheck(body, { allow, status } = {}) {
  if (!(await allow())) return { status: 429, body: { error: "That's a lot of checks. Try again in a few minutes." } };
  return { status: 200, body: { results: await checkSocialLinks(body?.links, { status }) } };
}

module.exports = { checkSocialLinks, handleSocialCheck, verdict };
