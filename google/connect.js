// One connect job for everything Google (code plan 6.17 and 6.20). After the press signs in with their Google account
// and allows Colophon once, this links, in order:
//
//   firebase        the shop's own Firebase project (made by the platform, owned by Colophon) is ready to take the
//                   Google settings, and names the shop's own reporting account (its server's service account)
//   analytics       a Google Analytics property and web stream in the press's own Analytics account; the measurement
//                   ID goes to the shop (settings/website.analytics, so the shop's existing tag and consent rules do
//                   the rest) with the property number (adminSecrets/googleAnalytics), and the shop's reporting account
//                   gets Viewer access, so the Overview shows Google's figures
//   domain          the press's own web address, when one opens the shop (services/domains, through domainBridge.js)
//   searchConsole   the shop's address in Search Console, verified through a file on the shop's own pages; the own
//                   address too, verified through a record added by the domain's Allow step (plan 6.15). The shop's
//                   reporting account is made an owner and the sitemap is sent
//   merchantCenter  the press's Merchant Center account (made when they have none), the shop's book feed as its
//                   product source (Google Shopping), and free listings switched on
//   email           the shop's sender: the press's Gmail once Julian switches that on (GOOGLE_GMAIL_SENDING), else
//                   orders@<their domain> (services/email/ownDomain.js), else Colophon's with the press's name
//   drive, youtube, calendar, businessProfile, ads
//                   the extras, each only when the press ticked it
//
// Every step is safe to run again: it first looks at what the registry row and Google already have, and changes only
// what is missing. A part whose permission the press didn't give waits and changes nothing. Each step's outcome is
// recorded in the registry row's `google.steps` and the shop's audit log (record.js). The press's Google accounts are
// theirs: nothing here deletes anything in them.
//
// Clients passed in:
//   google        googleApi.js (fakes.js has a pretend one)
//   tokens        tokens.js
//   shopFirebase  the shop's own project: serviceAccount(projectId), writeAnalytics(projectId, { measurementId,
//                 propertyId }), writeSearchConsoleSite(projectId, site), publishVerificationFile(projectId,
//                 { name, content }), clearTag(projectId), deleteProject(projectId)
//   domainsCall   domainBridge.js
//   ownDomain     services/email/ownDomain.js
//   registry, auditLog
import { SCOPES, ANALYTICS_VIEWER_ROLE } from "./endpoints.js";
import { GoogleError } from "./googleApi.js";
import { createRecorder } from "./record.js";
import { liveDomainOf } from "./domainBridge.js";

export const CORE_STEPS = Object.freeze(["firebase", "analytics", "domain", "searchConsole", "merchantCenter", "email"]);
export const EXTRA_STEPS = Object.freeze(["drive", "youtube", "calendar", "businessProfile", "ads"]);
export const CONNECT_STEPS = Object.freeze([...CORE_STEPS, ...EXTRA_STEPS]);

const FEED_FILE = "google-merchant-feed.xml";
const FEED_NAME = "Book feed from Colophon";
const TIME_ZONE = "America/Toronto";

/** The shop's own address, https://… with no trailing slash. */
export function siteOf(row) {
  const site = typeof row.siteUrl === "string" && /^https:\/\/[^/\s]+/.test(row.siteUrl) ? row.siteUrl : `https://${row.projectId ?? row.shopId}.web.app`;
  return site.replace(/\/+$/, "");
}

/** Plain words for a Google refusal, for the press and the control room. */
export function plainProblem(err) {
  if (err instanceof GoogleError && (err.status === 401 || err.status === 403)) return "Google said no to this part. Connect Google again and leave every box ticked.";
  if (err instanceof GoogleError && err.status === 429) return "Google is busy. This part is tried again in a while.";
  return "Google didn't answer. Press Try again in a minute.";
}

export function createGoogleConnect({ google, tokens, shopFirebase, domainsCall, ownDomain, registry, auditLog, config, now = () => Date.now() }) {
  const recorder = createRecorder({ registry, auditLog, now });
  const iso = recorder.iso;
  const notAllowed = (what) => ({ state: "waiting", detail: `You didn't allow ${what}. Connect Google again and leave it ticked.` });
  const has = (ctx, part) => SCOPES[part].every((scope) => ctx.scopes.includes(scope));

  const STEPS = {
    async firebase(ctx) {
      if (!ctx.row.projectId) return { state: "failed", detail: "Your shop isn't finished being made yet." };
      if (!(await auditLog.ready(ctx.shopId))) return { state: "waiting", detail: "Your shop isn't finished being made yet." };
      const serviceAccount = await shopFirebase.serviceAccount(ctx.row.projectId);
      return { state: "done", detail: "Your shop is ready for Google.", record: { projectId: ctx.row.projectId, serviceAccount } };
    },

    async analytics(ctx) {
      if (!has(ctx, "analytics")) return notAllowed("Google Analytics");
      const prev = ctx.google.analytics ?? {};
      const site = siteOf(ctx.row);
      const displayName = `${ctx.row.pressName || ctx.shopId} shop`;
      let propertyId = prev.propertyId ?? null;
      if (propertyId) {
        try { await google.getProperty(ctx.token, `properties/${propertyId}`); } catch (err) {
          if (!(err instanceof GoogleError) || err.status !== 404) throw err;
          propertyId = null; // the press deleted it in Google: make a new one
        }
      }
      if (!propertyId) {
        const summaries = await google.accountSummaries(ctx.token);
        const found = summaries.flatMap((s) => s.propertySummaries ?? []).find((p) => p.displayName === displayName);
        if (found) propertyId = found.property.replace(/^properties\//, "");
        else {
          if (!summaries.length) return { state: "waiting", detail: "Google needs you to accept its Analytics terms once. Open analytics.google.com, follow its first steps, then press Try again." };
          const made = await google.createProperty(ctx.token, { account: summaries[0].account, displayName, timeZone: TIME_ZONE, currencyCode: ctx.row.currency || "CAD" });
          propertyId = made.name.replace(/^properties\//, "");
        }
      }
      const property = `properties/${propertyId}`;
      let stream = prev.propertyId === propertyId && prev.streamId ? { name: `${property}/dataStreams/${prev.streamId}`, webStreamData: { measurementId: prev.measurementId } } : null;
      if (!stream) {
        stream = (await google.listStreams(ctx.token, property)).find((s) => s.type === "WEB_DATA_STREAM" && String(s.webStreamData?.defaultUri ?? "").replace(/\/+$/, "") === site)
          ?? (await google.createWebStream(ctx.token, property, { displayName: "Shop", defaultUri: site }));
      }
      const measurementId = stream.webStreamData.measurementId;
      const streamId = stream.name.split("/").pop();
      if (prev.measurementId !== measurementId || prev.propertyId !== propertyId || !prev.writtenAt || prev.tagStoppedAt) {
        await shopFirebase.writeAnalytics(ctx.row.projectId, { measurementId, propertyId });
      }
      const viewer = ctx.google.firebase?.serviceAccount ?? (await shopFirebase.serviceAccount(ctx.row.projectId));
      if (prev.viewer !== viewer || prev.propertyId !== propertyId || prev.tagStoppedAt) {
        const bindings = await google.listAccessBindings(ctx.token, property);
        if (!bindings.some((b) => b.user === viewer)) await google.createAccessBinding(ctx.token, property, { user: viewer, roles: [ANALYTICS_VIEWER_ROLE] });
      }
      return {
        state: "done", detail: "Visits to your shop are counted in your Google Analytics, for visitors who agree to it.",
        record: { propertyId, streamId, measurementId, viewer, writtenAt: prev.propertyId === propertyId && prev.writtenAt && !prev.tagStoppedAt ? prev.writtenAt : iso(), tagStoppedAt: null },
      };
    },

    async domain(ctx) {
      const name = await domainsCall("liveDomain", ctx.row);
      if (!name) return { state: "waiting", detail: "When your own web address opens your shop, it joins Google by itself." };
      return { state: "done", detail: `${name} is linked to your shop on Google.`, record: { name } };
    },

    async searchConsole(ctx) {
      if (!has(ctx, "searchConsole")) return notAllowed("Google search");
      const prev = ctx.google.searchConsole ?? {};
      const sites = { ...(prev.sites ?? {}) };
      const owner = ctx.google.firebase?.serviceAccount ?? (await shopFirebase.serviceAccount(ctx.row.projectId));
      const shopSite = `${siteOf(ctx.row)}/`;

      const finish = async (siteUrl, { type, identifier, method }, sitemapUrl) => {
        const resource = await google.verifySite(ctx.token, { type, identifier, method });
        if (!(resource.owners ?? []).includes(owner)) await google.setOwners(ctx.token, resource.id, { ...resource, owners: [...(resource.owners ?? []), owner] });
        await google.addSite(ctx.token, siteUrl);
        await google.submitSitemap(ctx.token, siteUrl, sitemapUrl);
        return { done: true, resourceId: resource.id, owner, sitemap: sitemapUrl };
      };

      if (!sites[shopSite]?.done || sites[shopSite].owner !== owner) {
        const { token: file } = await google.verificationToken(ctx.token, { type: "SITE", identifier: shopSite, method: "FILE" });
        await shopFirebase.publishVerificationFile(ctx.row.projectId, { name: file, content: `google-site-verification: ${file}` });
        sites[shopSite] = await finish(shopSite, { type: "SITE", identifier: shopSite, method: "FILE" }, `${shopSite}sitemap.xml`);
      }

      let waitingOn = null;
      const domain = liveDomainOf(ctx.row);
      if (domain) {
        const domainSite = `sc-domain:${domain}`;
        if (!sites[domainSite]?.done) {
          const { token: value } = await google.verificationToken(ctx.token, { type: "INET_DOMAIN", identifier: domain, method: "DNS_TXT" });
          const added = await domainsCall("addRecords", ctx.row, { domain, records: [{ type: "TXT", host: domain, value }], purpose: "google" });
          if (added?.done) sites[domainSite] = await finish(domainSite, { type: "INET_DOMAIN", identifier: domain, method: "DNS_TXT" }, `https://${domain}/sitemap.xml`);
          else { sites[domainSite] = { done: false }; waitingOn = domain; }
        }
      }
      // The Overview reads the own address's figures once it is verified, else the shop's.
      const chosen = domain && sites[`sc-domain:${domain}`]?.done ? `sc-domain:${domain}` : shopSite;
      if (prev.chosen !== chosen) await shopFirebase.writeSearchConsoleSite(ctx.row.projectId, chosen);
      return {
        state: "done",
        detail: waitingOn
          ? `Your shop is on Google search and its book list was sent. ${waitingOn} joins once its Allow step is done.`
          : "Your shop is on Google search and its book list was sent.",
        record: { sites, chosen },
      };
    },

    async merchantCenter(ctx) {
      if (!has(ctx, "merchantCenter")) return notAllowed("Google Shopping");
      const prev = ctx.google.merchantCenter ?? {};
      const accountName = ctx.row.pressName || ctx.shopId;
      let account = prev.account ?? null;
      if (!account) {
        account = (await google.listMerchantAccounts(ctx.token)).find((a) => a.accountName === accountName)?.name ?? null;
        if (!account) {
          // Google links every account made through the API to Colophon's own Merchant Center account (plan 15.14).
          if (!config.merchantProviderId) return { state: "waiting", detail: "Google Shopping isn't open yet." };
          account = (await google.createMerchantAccount(ctx.token, { accountName, ownerEmail: ctx.accountEmail, timeZone: TIME_ZONE, languageCode: "en", providerId: config.merchantProviderId })).name;
        }
      }
      const feedUrl = `${siteOf(ctx.row)}/${FEED_FILE}`;
      let dataSource = prev.account === account && !prev.feedStoppedAt ? prev.dataSource ?? null : null;
      if (!dataSource) {
        dataSource = (await google.listDataSources(ctx.token, account)).find((d) => d.displayName === FEED_NAME)?.name
          ?? (await google.createDataSource(ctx.token, account, { displayName: FEED_NAME, fileUri: feedUrl, feedLabel: "CA", contentLanguage: "en", countries: ["CA"] })).name;
      }
      if (!prev.freeListingsAt || prev.account !== account) await google.enableFreeListings(ctx.token, account);
      return {
        state: "done", detail: "Your books are sent to Google Shopping each day and show in its free listings.",
        record: { account, dataSource, feedUrl, freeListingsAt: prev.account === account && prev.freeListingsAt ? prev.freeListingsAt : iso(), feedStoppedAt: null },
      };
    },

    async email(ctx) {
      if (config.gmailSending && has(ctx, "email")) {
        if (ctx.row.gmailSender?.on !== true || ctx.row.gmailSender.address !== ctx.accountEmail) {
          await registry.updateShop(ctx.shopId, { gmailSender: { on: true, address: ctx.accountEmail, since: iso() } });
        }
        return { state: "done", detail: `Your shop's emails go from ${ctx.accountEmail}.`, record: { via: "gmail", address: ctx.accountEmail } };
      }
      const domain = liveDomainOf(ctx.row);
      if (domain) {
        const sender = await ownDomain.connect(ctx.shopId, domain);
        if (sender.state === "on") return { state: "done", detail: `Your shop's emails come from orders@${domain}. Replies reach you.`, record: { via: "own-domain", address: `orders@${domain}` } };
        return { state: "waiting", detail: `Your shop's emails will come from orders@${domain} once that address is ready. Until then they come from Colophon with your press's name.`, record: { via: "colophon", address: null } };
      }
      return { state: "done", detail: "Your shop's emails come from Colophon with your press's name. Replies reach you.", record: { via: "colophon", address: null } };
    },

    async drive(ctx) {
      if (!has(ctx, "drive")) return notAllowed("backups to your Google Drive");
      const prev = ctx.google.drive ?? {};
      const name = `${ctx.row.pressName || ctx.shopId} backups from Colophon`;
      const folderId = prev.folderId ?? (await google.findFolder(ctx.token, name))?.id ?? (await google.createFolder(ctx.token, name)).id;
      return { state: "done", detail: `Each night a copy of your shop goes to the folder "${name}" in your Google Drive.`, record: { folderId, name, stoppedAt: null } };
    },

    async youtube(ctx) {
      if (!has(ctx, "youtube")) return notAllowed("YouTube");
      const prev = ctx.google.youtube ?? {};
      const channel = prev.channelId ? { id: prev.channelId, snippet: { title: prev.title } } : await google.myChannel(ctx.token);
      if (!channel) return { state: "waiting", detail: "Your Google account has no YouTube channel yet. Make one, then press Try again." };
      return { state: "done", detail: `Pick trailers from ${channel.snippet?.title || "your channel"} on each book's page.`, record: { channelId: channel.id, title: channel.snippet?.title ?? null, stoppedAt: null } };
    },

    async calendar(ctx) {
      if (!has(ctx, "calendar")) return notAllowed("Google Calendar");
      const prev = ctx.google.calendar ?? {};
      let calendarId = prev.calendarId ?? null;
      if (calendarId) {
        try { await google.getCalendar(ctx.token, calendarId); } catch (err) {
          if (!(err instanceof GoogleError) || err.status !== 404) throw err;
          calendarId = null;
        }
      }
      const summary = `${ctx.row.pressName || ctx.shopId} events`;
      if (!calendarId) calendarId = (await google.createCalendar(ctx.token, { summary, timeZone: TIME_ZONE })).id;
      return { state: "done", detail: `Launches and fairs you add to the "${summary}" calendar show on your website's events.`, record: { calendarId, summary, stoppedAt: null } };
    },

    async businessProfile(ctx) {
      if (!config.businessProfile) return { state: "waiting", detail: "Google Business Profile isn't open yet." };
      if (!has(ctx, "businessProfile")) return notAllowed("Google Business Profile");
      const prev = ctx.google.businessProfile ?? {};
      const accountId = prev.accountId ?? (await google.listBusinessAccounts(ctx.token))[0]?.name ?? null;
      if (!accountId) return { state: "waiting", detail: "You have no Google Business Profile yet. Make one at business.google.com, then press Try again." };
      // Only the press's profile is found and kept on record; nothing is written to it yet (plan 15.13), so nothing is promised.
      return { state: "done", detail: "Your Google Business Profile is found and kept on record. Nothing on it is changed.", record: { accountId, stoppedAt: null } };
    },

    async ads(ctx) {
      if (config.adsAccess === "off") return { state: "waiting", detail: "Google Ads isn't open yet." };
      if (!has(ctx, "ads")) return notAllowed("Google Ads");
      const prev = ctx.google.ads ?? {};
      const merchant = ctx.google.merchantCenter;
      if (!merchant?.account || merchant.feedStoppedAt) return { state: "waiting", detail: "Google Shopping needs to be linked first." };
      const customerId = prev.customerId ?? (await google.listAdsCustomers(ctx.token))[0] ?? null;
      if (!customerId) return { state: "waiting", detail: "You have no Google Ads account yet. Make one at ads.google.com, then press Try again." };
      const linkName = prev.customerId === customerId && prev.linkName && !prev.stoppedAt
        ? prev.linkName
        : (await google.createProductLink(ctx.token, customerId, merchant.account.replace(/^accounts\//, ""))).resourceName ?? `customers/${customerId}/productLinks/merchant`;
      return { state: "done", detail: "Your book feed is linked to Google Ads. Nothing is spent unless you start an ad there yourself.", record: { customerId, linkName, stoppedAt: null } };
    },
  };

  /** The steps for this shop: the core ones, then each extra the press ticked. */
  const stepsFor = (extras = []) => [...CORE_STEPS, ...EXTRA_STEPS.filter((s) => extras.includes(s))];

  /**
   * Runs the connect job for one shop; `only` runs just those steps (the control room's Run again). Returns each step's
   * outcome. Without a live Google grant nothing runs.
   */
  async function run(shopId, { only = null } = {}) {
    const access = await tokens.fresh(shopId);
    if (!access) return { connected: false, steps: [] };
    const first = await registry.getShop(shopId);
    if (!first) throw new Error(`The registry has no shop ${shopId}`);
    if (!first.google?.connectedAt || first.google.closedAt || first.google.accountEmail !== access.accountEmail) {
      await recorder.updateGoogle(shopId, { connectedAt: first.google?.connectedAt && !first.google.closedAt ? first.google.connectedAt : iso(), closedAt: null, accountEmail: access.accountEmail });
    }
    const results = [];
    for (const step of stepsFor(access.extras)) {
      if (only && !only.includes(step)) continue;
      const row = { ...(await registry.getShop(shopId)), shopId };
      const ctx = { shopId, row, google: row.google ?? {}, token: access.token, scopes: access.scopes, accountEmail: access.accountEmail };
      let outcome;
      try { outcome = await STEPS[step](ctx); } catch (err) {
        console.error(`Google ${step} for ${shopId} failed:`, err?.message || err);
        outcome = { state: "failed", detail: plainProblem(err) };
      }
      await recorder.recordStep(shopId, step, outcome);
      results.push({ step, state: outcome.state, detail: outcome.detail });
    }
    return { connected: true, steps: results };
  }

  return { run, stepsFor };
}
