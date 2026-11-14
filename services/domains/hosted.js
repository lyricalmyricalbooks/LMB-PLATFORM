// The domain service on the hosted server, for the shared system (docs/shared-system.md). Every shop there is a folder
// in one project: its addresses go on that project's Hosting site and in the front door's address book, and its server
// settings and profile are fields of its record, so the domain service needs no deploy of its own any more. A shop
// with a project of its own is refused in plain words (`sharedOnly`).
//
// A press's own domain needs none of the settings below (14 November 2026): the service is on whenever the server can
// reach the shops' shared projects, and each shop is looked after in the shared project its registry row names
// (`shared` is clients/shared.js `storesOf`: the test shops live in the test project, real shops in the live one).
// Only the free addresses wait for the shops' own domain.
//
//   SHARED_SHOPS_DOMAIN          the shops' free addresses go under it (<id>.<it>)
//   SHOP_ADDRESS_ZONE            the Cloud DNS zone that holds it, and its project (SHOP_ADDRESS_ZONE_PROJECT): with
//   SHOP_ADDRESS_ZONE_PROJECT    both, the free addresses' lines are written there; without, a free address waits for
//                                its lines by hand
//   DOMAIN_CONNECT_*             the one-step Allow window (config.js); without, every press gets the guide
import { promises as dns } from "node:dns";
import { googleClients } from "../../clients/google.js";
import { readDomainConnectConfig } from "./config.js";
import { createDomainService } from "./domains.js";
import { readFreeAddressConfig } from "./freeAddress.js";
import { platformZoneClient } from "./platformZone.js";
import { publicLinesClient } from "./sellers.js";

const text = (value) => String(value ?? "").trim();

/** The free addresses' settings in the shared system, or null when its zone isn't named. Throws on a mismatch. */
export function sharedFreeAddressConfig(env = {}, { platformDomain = "" } = {}) {
  const domain = text(env.SHARED_SHOPS_DOMAIN).toLowerCase();
  const older = text(env.SHOP_ADDRESS_DOMAIN).toLowerCase();
  if (older && domain && older !== domain) throw new Error("SHOP_ADDRESS_DOMAIN and SHARED_SHOPS_DOMAIN name different domains; the shared system uses SHARED_SHOPS_DOMAIN");
  if (!text(env.SHOP_ADDRESS_ZONE) && !text(env.SHOP_ADDRESS_ZONE_PROJECT)) return null;
  if (!domain && !older) return null;
  return readFreeAddressConfig({ SHOP_ADDRESS_DOMAIN: domain || older, SHOP_ADDRESS_ZONE: env.SHOP_ADDRESS_ZONE, SHOP_ADDRESS_ZONE_PROJECT: env.SHOP_ADDRESS_ZONE_PROJECT }, { platformDomain });
}

const refuse = (what) => async () => { throw new Error(`${what} isn't used in the shared system`); };

/**
 * `{ env, fetch, token, shared, registry, auditLog, payments, email, presses, sellers, settings }` -> the domain service,
 * or null when there is no way to reach a shared project's stores. `shared` is one project's stores
 * (clients/shared.js sharedStores) or `storesOf(row)`, which finds the shared project each shop lives in.
 */
export function sharedDomainService({ env = {}, fetch, token, shared, registry, auditLog, payments = null, email = null, presses = null, sellers = null, settings = {}, google = null, resolver = dns, now }) {
  if (!shared) return null;
  const platformDomain = settings.domain ?? "";
  const freeAddress = sharedFreeAddressConfig(env, { platformDomain });
  const { hosting, authConfig } = google ?? googleClients({ fetch, token });
  return createDomainService({
    registry, auditLog, hosting, payments, email, presses, sellers, platformDomain, shared, sharedOnly: true,
    // The owner signs in at /admin on the new address, so it joins the shared project's sign-in list.
    signIn: authConfig ? { allow: (project, host) => authConfig.allowDomain(project, host), forget: (project, host) => authConfig.forgetDomain?.(project, host) } : null,
    // A shared shop has no settings file, profile file or deploy of its own (its record holds them).
    envFiles: { read: async () => null, write: refuse("A settings file") },
    profileFiles: { read: async () => null, write: refuse("A profile file") },
    deploy: { deployed: async () => null, functions: refuse("A deploy"), pages: refuse("A deploy") },
    publicLines: publicLinesClient({ resolver }),
    domainConnect: readDomainConnectConfig(env),
    freeAddress,
    platformZone: freeAddress ? platformZoneClient({ fetch, token, project: freeAddress.project, zone: freeAddress.zone, shopDomain: freeAddress.domain }) : null,
    ...(now ? { now: () => now().getTime() } : {}),
  });
}
