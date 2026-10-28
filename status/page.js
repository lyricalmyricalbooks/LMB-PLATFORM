// The status page's reading and drawing, kept apart from index.html so tests can run it. Reads the one public document
// (publicStatus/current) over Firestore's REST address; no sign-in and no Firebase library.
import { statusWords } from "./summary.js";

/** A Firestore REST value as plain JSON. */
export function fromValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
  return null;
}

/** The summary, or null when there is none yet. Throws on any other answer, so the page can say it couldn't load. */
export async function loadStatus({ projectId, fetch = globalThis.fetch }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/publicStatus/current`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`status ${response.status}`);
  return fromValue({ mapValue: { fields: (await response.json()).fields ?? {} } });
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The page's main block as HTML, from a summary (or null) or a load error. */
export function renderStatus(summary, { now = () => new Date(), error = null, locale } = {}) {
  if (error) {
    return `<p class="headline tone-quiet">We couldn't load the status just now. It tries again every minute.</p>`;
  }
  const words = statusWords(summary, { now });
  const when = words.checkedAt
    ? `<p class="checked">Last checked ${escape(new Date(words.checkedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }))}</p>`
    : "";
  const rows = words.parts.map((part) => `<li class="part state-${part.state}"><span>${escape(part.name)}</span><strong>${escape(part.words)}</strong></li>`).join("");
  // The team's own note about a known problem, when there is one, above what the checks see.
  const note = summary?.note?.text
    ? `<p class="note" role="note">${escape(summary.note.text)}${summary.note.at ? ` <span class="checked">(${escape(new Date(summary.note.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }))})</span>` : ""}</p>`
    : "";
  return `${note}<p class="headline tone-${words.tone}">${escape(words.headline)}</p>${rows ? `<ul class="parts">${rows}</ul>` : ""}${when}`;
}
