// In-memory stand-ins for the domain service's tests: a pretend Firebase Hosting and a pretend deploy. Nothing here
// reaches Google.

/** Firebase Hosting's custom domains, one `state` per domain that the test moves along. */
export function fakeHosting() {
  const domains = new Map();
  const calls = [];
  const key = (projectId, domain) => `${projectId}/${domain}`;
  const DNS = (domain) => ({
    desired: [{ domainName: domain, records: [
      { domainName: domain, type: "A", rdata: "199.36.158.100", requiredAction: "ADD" },
      { domainName: domain, type: "A", rdata: "192.0.2.10", requiredAction: "REMOVE" },
      { domainName: domain, type: "TXT", rdata: "hosting-site=moth-press", requiredAction: "NONE" },
    ] }],
  });
  return {
    calls,
    /** Moves a domain to "dns" (waiting), "securing", "live" or "conflict". */
    set(projectId, domain, state) {
      const found = domains.get(key(projectId, domain));
      if (!found) throw new Error(`no ${domain}`);
      found.state = state;
    },
    async getDomain(projectId, domain) {
      calls.push(["getDomain", projectId, domain]);
      const found = domains.get(key(projectId, domain));
      if (!found) return null;
      const name = `projects/${projectId}/sites/${projectId}/customDomains/${domain}`;
      if (found.state === "live") return { name, hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" }, requiredDnsUpdates: { desired: [] } };
      if (found.state === "securing") return { name, hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_PROPAGATING" } };
      if (found.state === "conflict") return { name, hostState: "HOST_CONFLICT", ownershipState: "OWNERSHIP_CONFLICT" };
      return { name, hostState: "HOST_UNHOSTED", ownershipState: "OWNERSHIP_MISSING", cert: { state: "CERT_PREPARING" }, requiredDnsUpdates: DNS(domain) };
    },
    async addDomain(projectId, domain) {
      calls.push(["addDomain", projectId, domain]);
      if (!domains.has(key(projectId, domain))) domains.set(key(projectId, domain), { state: "dns" });
    },
    async removeDomain(projectId, domain) {
      calls.push(["removeDomain", projectId, domain]);
      domains.delete(key(projectId, domain));
    },
  };
}

/** The shop's server code and pages: which version each runs, and what was deployed again. */
export function fakeDeploy(live = { version: "1.4.0", region: "northamerica-northeast1" }, pages = { version: "1.4.0", url: "https://moth-press.web.app" }) {
  const shipped = [];
  const pagesShipped = [];
  return {
    shipped,
    pagesShipped,
    deployed: async (_shopId, part) => (part === "functions" ? live : part === "pages:shop" ? pages : null),
    async functions(shopId, options) { shipped.push({ shopId, ...options }); },
    async pages(shopId, options) { pagesShipped.push({ shopId, ...options }); },
  };
}

/** The shop's saved server settings files. */
export function fakeEnvFiles(files = {}) {
  const map = new Map(Object.entries(files));
  return { map, read: async (shopId) => map.get(shopId) ?? null, async write(shopId, text) { map.set(shopId, text); } };
}

/** The /shop-profile.js files the shops' pages ship with. */
export function fakeProfileFiles(files = {}) {
  const map = new Map(Object.entries(files));
  return { map, read: async (shopId) => map.get(shopId) ?? null, async write(shopId, text) { map.set(shopId, text); } };
}
