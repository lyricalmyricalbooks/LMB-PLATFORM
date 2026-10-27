// Checkout address finder backed by Google Places (New), reached only through this Function so the
// key stays in the admin-only adminSecrets/addressLookup doc. Without a key the storefront uses its
// free OpenStreetMap (Photon) finder instead; every failure here answers `fallback: true` so the
// browser switches to that finder rather than leaving the shopper with nothing.
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const TIMEOUT_MS = 6000;

// Countries that write the house number after the street name ("Hauptstraße 5").
const NUMBER_AFTER_STREET = new Set(["de", "at", "ch", "nl", "be", "dk", "no", "se", "fi", "is", "it", "es", "pt", "pl", "cz", "sk", "hu", "si", "hr", "rs", "gr", "tr", "mx", "br", "ar", "cl", "co", "pe", "uy"]);
// Predictions that are only a place name (a city, a province, a postal area) aren't a delivery address.
const REGION_TYPES = new Set(["locality", "sublocality", "sublocality_level_1", "sublocality_level_2", "postal_town", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "country", "postal_code", "postal_code_prefix", "political", "neighborhood", "colloquial_area", "geocode", "continent", "archipelago", "natural_feature"]);

const cleanText = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
/** Google's session token: URL-safe base64 up to 36 characters (a UUID fits). */
const cleanSession = v => (typeof v === "string" && /^[A-Za-z0-9_-]{8,36}$/.test(v) ? v : "");
const cleanCountry = v => (typeof v === "string" && /^[a-z]{2}$/i.test(v) ? v.toLowerCase() : "");
const cleanPlaceId = v => (typeof v === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(v) ? v : "");

/** A stored key worth trying: Google API keys are 39 characters starting with "AIza". */
function addressKeyProblem(value) {
  const v = String(value || "").trim();
  if (!v) return "Enter a Google Maps Platform API key.";
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(v)) return "That doesn't look like a Google API key (it starts with AIza and is 39 characters).";
  return "";
}

async function googleFetch(fetchImpl, url, init) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Google answered ${res.status}`);
      err.status = res.status;
      err.googleStatus = data?.error?.status || "";
      throw err;
    }
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Pure: Google autocomplete predictions → the rows the checkout list shows. */
function predictionsToRows(data) {
  const out = [];
  for (const s of Array.isArray(data?.suggestions) ? data.suggestions : []) {
    const p = s?.placePrediction;
    const id = cleanPlaceId(p?.placeId);
    if (!id) continue;
    const types = Array.isArray(p.types) ? p.types : [];
    if (types.length && types.every(t => REGION_TYPES.has(t))) continue;
    const main = cleanText(p.structuredFormat?.mainText?.text, 200);
    const secondary = cleanText(p.structuredFormat?.secondaryText?.text, 200);
    const label = cleanText(p.text?.text, 300) || [main, secondary].filter(Boolean).join(", ");
    if (!label) continue;
    out.push({ placeId: id, label, main: main || label, secondary });
    if (out.length >= 5) break;
  }
  return out;
}

/** Pure: Google address components → checkout fields. `country` is the ISO code (upper case). */
function componentsToAddress(components) {
  const list = Array.isArray(components) ? components : [];
  const get = (type, short = false) => {
    const c = list.find(x => Array.isArray(x?.types) && x.types.includes(type));
    return cleanText(short ? c?.shortText || c?.longText : c?.longText || c?.shortText, 120);
  };
  const country = get("country", true).toUpperCase();
  const number = get("street_number");
  const route = get("route");
  const street = !route ? number : !number ? route
    : NUMBER_AFTER_STREET.has(country.toLowerCase()) ? `${route} ${number}` : `${number} ${route}`;
  return {
    street,
    unit: get("subpremise"),
    city: get("locality") || get("postal_town") || get("sublocality_level_1") || get("sublocality") || get("administrative_area_level_3") || get("administrative_area_level_2"),
    stateCode: get("administrative_area_level_1", true),
    stateName: get("administrative_area_level_1"),
    zip: get("postal_code"),
    country,
    hasNumber: Boolean(number),
  };
}

async function autocomplete({ apiKey, input, country, sessionToken, fetchImpl = fetch }) {
  const body = { input, languageCode: "en" };
  if (country) body.includedRegionCodes = [country];
  if (sessionToken) body.sessionToken = sessionToken;
  const data = await googleFetch(fetchImpl, AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify(body),
  });
  return predictionsToRows(data);
}

async function placeAddress({ apiKey, placeId, sessionToken, fetchImpl = fetch }) {
  const qs = new URLSearchParams({ languageCode: "en" });
  if (sessionToken) qs.set("sessionToken", sessionToken);
  const data = await googleFetch(fetchImpl, `${DETAILS_URL}${encodeURIComponent(placeId)}?${qs}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "addressComponents" },
  });
  return componentsToAddress(data?.addressComponents);
}

/** Plain-English reason a key failed, for the admin's Check key button. */
function keyErrorMessage(err) {
  const status = Number(err?.status) || 0;
  const g = String(err?.googleStatus || "");
  if (status === 400 && /API key not valid/i.test(String(err?.message))) return "Google says this API key isn't valid. Copy it again from Google Cloud › APIs & Services › Credentials.";
  if (status === 403 || g === "PERMISSION_DENIED") return "Google refused the key. In Google Cloud, enable \"Places API (New)\" for the key's project, make sure billing is on, and if the key has API restrictions, allow Places API (New). Don't restrict it to websites — the shop's server uses it.";
  if (status === 429 || g === "RESOURCE_EXHAUSTED") return "Google says the key is over its quota. Check the quotas and budget in Google Cloud.";
  return `Google didn't accept the lookup (${err?.message || "no answer"}).`;
}

/**
 * The public `validateAddress` actions `addressSuggest` / `addressDetails` and the admin `addressKeyCheck`.
 * Returns { status, body }, or null when `isAdmin` already answered. `deps`: { readKey(fresh), allow(), isAdmin(), fetchImpl }.
 */
async function handleAddressLookup(body, deps) {
  const action = body?.action;
  if (action === "addressKeyCheck") {
    if (!(await deps.isAdmin())) return null; // isAdmin already answered 401/403
    const apiKey = await deps.readKey(true); // just saved: skip the per-instance cache
    if (!apiKey) return { status: 200, body: { ok: false, error: "No key is saved yet." } };
    try {
      const rows = await autocomplete({ apiKey, input: "100 Queen Street West, Toronto", country: "ca", fetchImpl: deps.fetchImpl });
      return { status: 200, body: rows.length ? { ok: true } : { ok: false, error: "Google answered but found no addresses. Check that Places API (New) is enabled for this key." } };
    } catch (err) {
      return { status: 200, body: { ok: false, error: keyErrorMessage(err) } };
    }
  }
  const apiKey = await deps.readKey();
  if (!apiKey) return { status: 200, body: { provider: "none", fallback: true } };
  if (!(await deps.allow())) return { status: 429, body: { error: "too_many", fallback: true } };
  const sessionToken = cleanSession(body.sessionToken);
  try {
    if (action === "addressSuggest") {
      const input = cleanText(body.query, 200);
      if (input.length < 3) return { status: 200, body: { provider: "google", items: [] } };
      const items = await autocomplete({ apiKey, input, country: cleanCountry(body.country), sessionToken, fetchImpl: deps.fetchImpl });
      return { status: 200, body: { provider: "google", items } };
    }
    const placeId = cleanPlaceId(body.placeId);
    if (!placeId) return { status: 400, body: { error: "bad_place" } };
    const address = await placeAddress({ apiKey, placeId, sessionToken, fetchImpl: deps.fetchImpl });
    return { status: 200, body: { provider: "google", address } };
  } catch (err) {
    console.warn(`Address lookup (${action}) failed:`, err?.status || "", err?.message || err);
    return { status: 502, body: { error: "unavailable", fallback: true } };
  }
}

module.exports = {
  ADDRESS_ACTIONS: ["addressSuggest", "addressDetails", "addressKeyCheck"],
  addressKeyProblem,
  predictionsToRows,
  componentsToAddress,
  autocomplete,
  placeAddress,
  keyErrorMessage,
  handleAddressLookup,
};
