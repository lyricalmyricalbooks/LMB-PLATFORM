// Email from the press's own domain (code plan 6.18). Once a press's own web address opens their shop, the same
// address can send the shop's emails: Colophon's Resend account adds the domain, its sending records are added through
// the domain service (google/domainBridge.js `domainsCall`; the registrar's Allow window comes with plan 6.15), and once
// Resend says the records check out, the shop's emails come from orders@<their domain> with nothing for the press to
// do. Replies still go to the press's own reply-to address (index.js never changes that).
//
// If the records break later (the press changes registrar, someone deletes a record), the shop goes straight back to
// Colophon's sender and the owner gets one plain email; when the records come back, the own address does too.
//
// Registry row `emailSender`: { domain, address, resendDomainId, state, since, onAt?, brokenAt?, checkedAt }
//   state "checking"  records asked for, Resend hasn't seen them yet: Colophon's sender meanwhile
//         "on"        emails come from `address`
//         "broken"    the records stopped checking out: Colophon's sender until they do again
//
// Clients passed in:
//   resendDomains  find(name) | create(name) | get(id) | verify(id) | remove(id): { id, name, status, records }
//                  (resendDomainsClient below; fakes.js has a pretend one). status "verified" means ready
//   registry       getShop, updateShop, listShops, recordEvent
//   auditLog       write(shopId, id, entry)
//   domainsCall    google/domainBridge.js
//   email          the email service (index.js): sendPlatform for the one notice

export const OWN_EMAIL_PAUSED = "own-email-paused";
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const RESEND_DOMAINS_URL = "https://api.resend.com/domains";

/** The address a shop's email comes from on its own domain, or null when that isn't on. */
export function ownDomainSender(row) {
  const sender = row?.emailSender;
  return sender?.state === "on" && typeof sender.address === "string" && /^orders@[a-z0-9.-]+$/.test(sender.address) ? sender.address : null;
}

/** Resend's domains over its REST API (docs: api-reference/domains), with the email service's key. */
export function resendDomainsClient({ apiKey, fetch }) {
  if (typeof apiKey !== "string" || !/^re_\S+$/.test(apiKey)) throw new Error("The email key is missing or is not a Resend key");
  const call = async (method, path = "", body) => {
    const response = await fetch(`${RESEND_DOMAINS_URL}${path}`, {
      method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Resend refused the domain call (${response.status}: ${answer?.message ?? "no answer"})`);
    return answer;
  };
  return {
    find: async (name) => ((await call("GET")).data ?? []).find((d) => d.name === name) ?? null,
    create: (name) => call("POST", "", { name }),
    get: (id) => call("GET", `/${encodeURIComponent(id)}`),
    verify: (id) => call("POST", `/${encodeURIComponent(id)}/verify`),
    remove: (id) => call("DELETE", `/${encodeURIComponent(id)}`),
  };
}

export function createOwnDomainSender({ resendDomains, registry, auditLog, domainsCall, email, now = () => Date.now() }) {
  const iso = () => new Date(now()).toISOString();

  async function logChange(shopId, kind, fields) {
    const at = iso();
    const id = `${kind}-${Date.parse(at)}`;
    const entry = { id, source: "email-service", kind, at, ...fields };
    await registry.recordEvent(shopId, entry);
    await auditLog.write(shopId, id, entry);
  }

  async function rowOf(shopId) {
    const row = await registry.getShop(shopId);
    if (!row) throw new Error(`The registry has no shop ${shopId}`);
    return { ...row, shopId };
  }

  /** Reads Resend's state and switches the sender on, or back to Colophon's when the records broke. */
  async function check(shopId) {
    const row = await rowOf(shopId);
    const sender = row.emailSender;
    if (!sender?.resendDomainId) return { state: "none", address: null };
    // Ask Resend to look again unless the records already check out.
    if (sender.state !== "on") await resendDomains.verify(sender.resendDomainId);
    const found = await resendDomains.get(sender.resendDomainId);
    const verified = found?.status === "verified";
    let next = { ...sender, checkedAt: iso() };
    if (verified && sender.state !== "on") {
      next = { ...next, state: "on", onAt: iso(), brokenAt: null };
      await logChange(shopId, "email.own-domain-on", { domain: sender.domain, address: sender.address });
    } else if (!verified && sender.state === "on") {
      next = { ...next, state: "broken", brokenAt: iso() };
      await logChange(shopId, "email.own-domain-broken", { domain: sender.domain, status: found?.status ?? "missing" });
      // One notice per time it was switched on: the idempotency key makes a re-run (or a second sweep) send nothing.
      if (row.ownerEmail) {
        await email.sendPlatform({
          kind: OWN_EMAIL_PAUSED, shopId, to: row.ownerEmail, idempotencyKey: `${OWN_EMAIL_PAUSED}-${shopId}-${sender.onAt}`,
          data: { pressName: row.pressName || shopId, domain: sender.domain },
        });
      }
    }
    await registry.updateShop(shopId, { emailSender: next });
    return { state: next.state, address: next.state === "on" ? next.address : null };
  }

  return {
    check,

    /** Starts sending from orders@<domain>: adds the domain at Resend once, asks for its records, then checks. */
    async connect(shopId, domain) {
      const name = String(domain ?? "").trim().toLowerCase();
      if (!DOMAIN.test(name)) throw new Error("That isn't a web address the shop can send from");
      const row = await rowOf(shopId);
      if (row.emailSender?.domain === name && row.emailSender.resendDomainId) return check(shopId);
      const found = (await resendDomains.find(name)) ?? (await resendDomains.create(name));
      const added = await domainsCall("addRecords", row, { domain: name, records: found.records ?? [], purpose: "email" });
      const emailSender = {
        domain: name, address: `orders@${name}`, resendDomainId: found.id, state: "checking", since: iso(),
        recordsAdded: added?.done === true, checkedAt: null,
      };
      await registry.updateShop(shopId, { emailSender });
      await logChange(shopId, "email.own-domain-added", { domain: name, recordsAdded: emailSender.recordsAdded });
      return check(shopId);
    },

    /** Every shop sending (or about to send) from its own domain, checked: the sweep every few hours. */
    async checkAll() {
      const results = [];
      for (const row of await registry.listShops()) {
        if (!row.emailSender?.resendDomainId) continue;
        try { results.push({ shopId: row.shopId, ...(await check(row.shopId)) }); } catch (err) {
          results.push({ shopId: row.shopId, state: "failed", detail: err.message });
        }
      }
      return results;
    },

    /** The shop is being deleted (google/teardown.js): the records and Resend's domain go; Colophon's sender stays. */
    async disconnect(shopId) {
      const row = await rowOf(shopId);
      const sender = row.emailSender;
      if (!sender?.resendDomainId) return { removed: false };
      await domainsCall("removeRecords", row, { domain: sender.domain, purpose: "email" });
      await resendDomains.remove(sender.resendDomainId);
      await registry.updateShop(shopId, { emailSender: null });
      await logChange(shopId, "email.own-domain-removed", { domain: sender.domain });
      return { removed: true };
    },
  };
}
