// How the shopper found the shop, saved on an order as one JSON string (`acquisition`). The server's copy of
// cleanAcquisition / encodeAcquisition in src/app/lib/visitSource.ts (parity-tested there): known keys only, each a
// string of at most 200, the whole string at most 2000 characters (the limit firestore.rules checks).
const ACQUISITION_KEYS = ["source", "medium", "campaign", "term", "content", "referrer", "landingPage", "clickId", "firstSeenAt"];
const ACQUISITION_MAX = 200;
const ACQUISITION_JSON_MAX = 2000;

function cleanAcquisition(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const key of ACQUISITION_KEYS) {
    const v = value[key];
    if (typeof v === "string" && v.trim()) out[key] = v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, ACQUISITION_MAX);
  }
  return out.source ? out : null;
}

function encodeAcquisition(value) {
  const a = cleanAcquisition(value);
  if (!a) return null;
  let text = JSON.stringify(a);
  while (text.length > ACQUISITION_JSON_MAX) {
    const longest = Object.keys(a).reduce((x, y) => (a[y].length > a[x].length ? y : x));
    a[longest] = a[longest].slice(0, Math.max(0, a[longest].length - 50));
    text = JSON.stringify(a);
  }
  return text;
}

module.exports = { cleanAcquisition, encodeAcquisition, ACQUISITION_KEYS, ACQUISITION_MAX, ACQUISITION_JSON_MAX };
