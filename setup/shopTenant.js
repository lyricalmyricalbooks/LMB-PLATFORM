// Each shop's own sign-in list in the shared project (docs/shared-system.md, step 4). A list is an Identity Platform
// tenant: the owner, staff, helpers and customers of one shop sign in on it, the apps set it on their sign-in
// (`tenant` in the shop's profile), and the rules and the server count a pass only in the shop whose list it came from.
//
// `ensureShopTenant` makes the list or finds the one already made, and sets it the way every shop needs it:
//   - email link sign-in on (customers' accounts and order links; Google needs the email provider on for it),
//   - Google sign-in on, with the shared project's own Google settings (owners and staff sign in with Google),
//   - authenticator codes allowed (plan 22.6: paid plans confirm big changes with one; nobody is made to use it).
// Safe to run twice: the shop's record names its list once made, and a list made by a run that stopped before the
// record was written is found again by its name. Nothing here deletes a list.
import { withTotp, totpOn } from "./twoStep.js";

/** Google's limits on a list's name: 4 to 20 letters, digits or hyphens, starting with a letter. */
const DISPLAY_NAME = /^[a-zA-Z][a-zA-Z0-9-]{3,19}$/;

/**
 * The name a shop's list is made with: the start of the shop's id and a short code from the whole id, so two shops
 * whose ids start the same still get different names. Always the same for the same shop.
 */
export function tenantName(shopId) {
  if (typeof shopId !== "string" || !/^[a-z][a-z0-9-]{2,62}$/.test(shopId)) throw new Error(`"${String(shopId).slice(0, 80)}" isn't a shop id.`);
  let hash = 0x811c9dc5;
  for (const ch of shopId) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const code = hash.toString(36).padStart(6, "0").slice(-6);
  const name = `${shopId.slice(0, 13).replace(/-+$/, "")}-${code}`;
  if (!DISPLAY_NAME.test(name)) throw new Error(`"${name}" isn't a sign-in list name Google takes.`);
  return name;
}

/** The list's id from Google's answer (`projects/<project>/tenants/<id>`). */
export const tenantIdOf = (tenant) => String(tenant?.name ?? "").split("/").pop();

/**
 * Makes (or finds) the shop's sign-in list and sets it up. `record` is the shop's record, if it has one already.
 * Returns { tenant, created, changed }: the list's id (written into the record and the profile by the caller), whether
 * this run made it, and which settings it changed.
 */
export async function ensureShopTenant({ google, projectId, shopId, record = null }) {
  const displayName = tenantName(shopId);
  const project = await google.authConfig.googleSignIn(projectId);
  if (!project?.enabled || !project.clientId || !project.clientSecret) {
    throw new Error(`Google sign-in isn't on in ${projectId} yet: turn it on there once, and every shop's list copies it.`);
  }

  const lists = await google.tenants.list(projectId);
  let list = (record?.tenant && lists.find((t) => tenantIdOf(t) === record.tenant))
    || lists.find((t) => t.displayName === displayName)
    || null;
  const created = !list;
  if (!list) list = await google.tenants.create(projectId, { displayName, allowPasswordSignup: true, enableEmailLinkSignin: true });
  const tenant = tenantIdOf(list);
  if (!tenant) throw new Error("Google made a sign-in list but gave no id for it.");

  const changed = [];
  const fields = {};
  if (list.allowPasswordSignup !== true) fields.allowPasswordSignup = true;
  if (list.enableEmailLinkSignin !== true) fields.enableEmailLinkSignin = true;
  if (!totpOn({ mfa: list.mfaConfig })) fields.mfaConfig = withTotp(list.mfaConfig);
  if (Object.keys(fields).length) {
    await google.tenants.patch(projectId, tenant, fields);
    changed.push(...Object.keys(fields));
  }

  const want = { enabled: true, clientId: project.clientId, clientSecret: project.clientSecret };
  const has = await google.tenants.googleSignIn(projectId, tenant);
  if (!has) {
    await google.tenants.addGoogleSignIn(projectId, tenant, want);
    changed.push("google");
  } else if (has.enabled !== true || has.clientId !== want.clientId || has.clientSecret !== want.clientSecret) {
    await google.tenants.patchGoogleSignIn(projectId, tenant, want);
    changed.push("google");
  }
  return { tenant, created, changed };
}
