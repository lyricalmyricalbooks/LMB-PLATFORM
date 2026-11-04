// The lines for shops' free addresses, written in the platform's own Cloud DNS zone (freeAddress.js): no press ever
// types them. Cloud DNS v1 resourceRecordSets.get / create / patch / delete (https://dns.googleapis.com/$discovery/rest?version=v1).
//
//   apply(records)  records as the domain service reads them from Firebase Hosting ({ action, host, type, value }):
//                   "add" lines are put in (joined with any other value the same name and kind already has), "remove"
//                   lines are taken out. Safe to repeat. Only names under the shop domain are touched.
import { googleHttp, isNotFound } from "../../clients/http.js";

const DNS = "https://dns.googleapis.com/dns/v1";
const TTL = 300;

const dotted = (host) => `${String(host).toLowerCase().replace(/\.$/, "")}.`;
/** Cloud DNS wants text lines in quotes and names ending in a dot. */
function rdataOf(type, value) {
  const text = String(value);
  if (type === "TXT") return text.startsWith("\"") ? text : `"${text}"`;
  if (type === "CNAME") return dotted(text);
  return text;
}

export function platformZoneClient({ fetch, token, project, zone, shopDomain }) {
  const call = googleHttp({ fetch, token });
  const base = `${DNS}/projects/${encodeURIComponent(project)}/managedZones/${encodeURIComponent(zone)}/rrsets`;
  const ours = (host) => { const h = String(host).toLowerCase().replace(/\.$/, ""); return h === shopDomain || h.endsWith(`.${shopDomain}`); };
  const get = async (name, type) => {
    try { return await call("GET", `${base}/${encodeURIComponent(name)}/${type}`); } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  };
  return {
    async apply(records = []) {
      const groups = new Map();
      for (const r of records) {
        if (!ours(r.host) || !r.type || !r.value) continue;
        const key = `${dotted(r.host)} ${r.type}`;
        const group = groups.get(key) ?? { name: dotted(r.host), type: r.type, add: [], remove: [] };
        group[r.action === "remove" ? "remove" : "add"].push(rdataOf(r.type, r.value));
        groups.set(key, group);
      }
      for (const { name, type, add, remove } of groups.values()) {
        const found = await get(name, type);
        const now = found?.rrdatas ?? [];
        // An alias (CNAME) holds one value: the new one replaces it.
        const next = type === "CNAME" && add.length ? [add[0]] : [...new Set([...now.filter((v) => !remove.includes(v)), ...add])];
        if (found && next.length === now.length && next.every((v) => now.includes(v))) continue;
        if (!next.length) { if (found) await call("DELETE", `${base}/${encodeURIComponent(name)}/${type}`); continue; }
        const body = { name, type, ttl: found?.ttl ?? TTL, rrdatas: next };
        if (found) await call("PATCH", `${base}/${encodeURIComponent(name)}/${type}`, { body });
        else await call("POST", base, { body });
      }
      return { done: true };
    },
  };
}

/** A pretend zone for tests: `lines` maps "name type" to its values; `calls` keeps every apply. */
export function fakePlatformZone() {
  const lines = new Map();
  const calls = [];
  return {
    lines,
    calls,
    async apply(records = []) {
      calls.push(records);
      for (const r of records) {
        const key = `${String(r.host).toLowerCase()} ${r.type}`;
        const values = new Set(lines.get(key) ?? []);
        if (r.action === "remove") values.delete(r.value); else values.add(r.value);
        if (values.size) lines.set(key, [...values]); else lines.delete(key);
      }
      return { done: true };
    },
  };
}
