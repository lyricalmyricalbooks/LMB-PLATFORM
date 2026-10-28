// The one place the Google link and the own-domain email sender reach the domain service (services/domains). Adding
// records through the registrar's Allow window (Domain Connect, plan 6.15) isn't built yet, and another thread is
// changing services/domains, so everything goes through `domainsCall` below: when the domain service learns a call,
// it is used; until then the answer is `{ waiting: true }`, and the step that asked waits instead of failing. Tests
// pass their own `domainsCall`.
//
//   domainsCall("liveDomain", row)                         -> the shop's own address that opens the shop, or null
//   domainsCall("addRecords", row, { domain, records, purpose })
//                                                          -> { done: true } once the records are in, or { waiting: true }
//   domainsCall("removeRecords", row, { domain, purpose }) -> the same
//   domainsCall("removeDomain", row, { domain, deleting }) -> the address is taken off hosting and its records removed

const DOMAIN_SERVICE_CALLS = { addRecords: "applyRecords", removeRecords: "removeRecords", removeDomain: "removeDomain" };

/** The shop's live own address from its registry row (services/domains keeps `domains: [{ name, state }]`). */
export function liveDomainOf(row) {
  const list = Array.isArray(row?.domains) ? row.domains : [];
  const live = list.find((d) => d && typeof d === "object" && d.state === "live" && typeof d.name === "string");
  return live ? live.name.toLowerCase() : null;
}

/** `domainService` is services/domains' service (createDomainService), or null while it isn't hosted. */
export function domainsBridge(domainService = null) {
  return async function domainsCall(op, row, args = {}) {
    if (op === "liveDomain") return liveDomainOf(row);
    const name = DOMAIN_SERVICE_CALLS[op];
    if (!name) throw new Error(`domainsCall has no ${op}`);
    if (typeof domainService?.[name] !== "function") return { waiting: true };
    return domainService[name](row.shopId, args);
  };
}
