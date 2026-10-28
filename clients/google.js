// The real `google` clients the shop maker's steps 2–11 use (shapes at the top of setup/steps.js and
// setup/later-steps.js), over Google's REST APIs. Every path and field below comes from that API's discovery document
// (https://<api>.googleapis.com/$discovery/rest?version=<v>); the method name is given with each call.
//
//   Resource Manager v3   projects.get, projects.create, operations.get, projects.getIamPolicy, projects.setIamPolicy
//   Cloud Billing v1      projects.getBillingInfo, projects.updateBillingInfo
//   Firebase Mgmt v1beta1 projects.get, projects.addFirebase, projects.webApps.list/create/getConfig, operations.get
//   Service Usage v1      services.list (filter state:ENABLED), services.batchEnable (at most 20 ids a call), operations.get
//   Firestore Admin v1    projects.databases.get/create (databaseId), databases.exportDocuments, databases.operations.get
//   Firebase Storage v1beta projects.getDefaultBucket, projects.defaultBucket.create, projects.buckets.addFirebase
//   Realtime Database Mgmt v1beta  projects.locations.instances.list (location "-"), projects.locations.instances.create
//                         (databaseId, type DEFAULT_DATABASE); the stockroom's database (plan 1.20)
//   Cloud Storage JSON v1 objects.get, objects.list (prefix, delimiter), objects.insert (simple media upload),
//                         buckets.get, buckets.insert (project) for the stockroom's own bucket (plan 1.20)
//   Secret Manager v1     projects.secrets.versions.access ("latest"), projects.secrets.create (secretId, automatic
//                         replication), projects.secrets.addVersion: the shop's service key (setup/serviceKey.js)
//   Firebase Hosting v1beta1  projects.sites.customDomains.get, projects.sites.customDomains.create (customDomainId),
//                         projects.sites.customDomains.delete: a press's own web address on the shop's default site
//                         (plan 2.9, 5.9, services/domains). Create starts a long-running setup on Google's side; its
//                         state is read back with get. Delete stops Hosting serving the shop there.
//   Firebase Storage (the address the shop's pages read files through, where storage rules apply):
//                         GET https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{name}?alt=media, with no sign-in.
//                         Not in a discovery document; it is the address Firebase's web SDK reads files from.
//
// Every create waits for Google's operation to finish, as steps.js expects. Nothing here deletes anything.
import { GoogleError, googleHttp, isAlreadyExists, isNotFound, waitForOperation } from "./http.js";

const RM = "https://cloudresourcemanager.googleapis.com/v3";
const BILLING = "https://cloudbilling.googleapis.com/v1";
const FIREBASE = "https://firebase.googleapis.com/v1beta1";
const USAGE = "https://serviceusage.googleapis.com/v1";
const FIRESTORE_ADMIN = "https://firestore.googleapis.com/v1";
const FIREBASE_STORAGE = "https://firebasestorage.googleapis.com/v1beta";
const GCS = "https://storage.googleapis.com/storage/v1";
const GCS_UPLOAD = "https://storage.googleapis.com/upload/storage/v1";
const FILES = "https://firebasestorage.googleapis.com/v0";
const RTDB = "https://firebasedatabase.googleapis.com/v1beta";
const SECRETS = "https://secretmanager.googleapis.com/v1";
const HOSTING = "https://firebasehosting.googleapis.com/v1beta1";

/** The role the nightly backup's account needs to export the database (the shop's runScheduledBackup). */
export const BACKUP_ROLE = "roles/datastore.importExportAdmin";
/** The storage test file step 11 writes, then reads without signing in. */
export const PROBE_FILE = "platform-checks/private-probe.txt";
const SERVICE_BATCH = 20;

const orNull = async (promise) => {
  try {
    return await promise;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
};

/**
 * `googleClients({ fetch, token, sleep, today })`. `today()` gives the backup's folder day (YYYY-MM-DD). The backup's
 * account is the shop's functions' runtime account (2nd-generation functions run as the default compute account,
 * `<project number>-compute@developer.gserviceaccount.com`).
 */
export function googleClients({ fetch, token, sleep, today = () => new Date().toISOString().slice(0, 10), everyMs = 2000 }) {
  const call = googleHttp({ fetch, token });
  const wait = (operation, base) => waitForOperation(call, operation, { pollUrl: (name) => `${base}/${name}`, sleep, everyMs });

  const projectNumber = async (projectId) => {
    const project = await call("GET", `${FIREBASE}/projects/${projectId}`);
    if (!project.projectNumber) throw new Error(`Firebase gave no project number for ${projectId}`);
    return project.projectNumber;
  };
  const backupAccount = async (projectId) => `serviceAccount:${await projectNumber(projectId)}-compute@developer.gserviceaccount.com`;
  const defaultBucket = async (projectId) => {
    const found = await orNull(call("GET", `${FIREBASE_STORAGE}/projects/${projectId}/defaultBucket`));
    return found?.bucket?.name ? found.bucket.name.split("/").at(-1) : null;
  };
  const needBucket = async (projectId) => {
    const bucket = await defaultBucket(projectId);
    if (!bucket) throw new Error(`${projectId} has no storage bucket yet (step 5)`);
    return bucket;
  };

  return {
    projects: {
      async get(projectId) {
        const project = await orNull(call("GET", `${RM}/projects/${projectId}`));
        return project ? { projectId: project.projectId, state: project.state, parent: project.parent } : null;
      },
      async create({ projectId, displayName, parent, labels }) {
        await wait(await call("POST", `${RM}/projects`, { body: { projectId, displayName, parent, labels } }), RM);
      },
    },
    billing: {
      async get(projectId) {
        const info = await call("GET", `${BILLING}/projects/${projectId}/billingInfo`);
        return { billingEnabled: info.billingEnabled === true, billingAccountName: info.billingAccountName ?? "" };
      },
      async link(projectId, billingAccountName) {
        await call("PUT", `${BILLING}/projects/${projectId}/billingInfo`, { body: { billingAccountName } });
      },
    },
    firebase: {
      getProject: (projectId) => orNull(call("GET", `${FIREBASE}/projects/${projectId}`)),
      async addFirebase(projectId) {
        await wait(await call("POST", `${FIREBASE}/projects/${projectId}:addFirebase`, { body: {} }), FIREBASE);
      },
      async listWebApps(projectId) {
        const apps = [];
        let pageToken;
        do {
          const page = await call("GET", `${FIREBASE}/projects/${projectId}/webApps`, { query: { pageToken } });
          apps.push(...(page.apps ?? []).map(({ appId, displayName }) => ({ appId, displayName })));
          pageToken = page.nextPageToken;
        } while (pageToken);
        return apps;
      },
      async createWebApp(projectId, displayName) {
        const app = await wait(await call("POST", `${FIREBASE}/projects/${projectId}/webApps`, { body: { displayName } }), FIREBASE);
        return { appId: app.appId };
      },
      async getWebAppConfig(projectId, appId) {
        const { apiKey, authDomain, storageBucket, messagingSenderId, appId: id } = await call("GET", `${FIREBASE}/projects/${projectId}/webApps/${appId}/config`);
        return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId: id };
      },
    },
    services: {
      async listEnabled(projectId) {
        const names = [];
        let pageToken;
        do {
          const page = await call("GET", `${USAGE}/projects/${projectId}/services`, { query: { filter: "state:ENABLED", pageSize: 200, pageToken } });
          names.push(...(page.services ?? []).map((service) => service.config?.name ?? service.name.split("/").at(-1)));
          pageToken = page.nextPageToken;
        } while (pageToken);
        return names;
      },
      async enable(projectId, names) {
        for (let i = 0; i < names.length; i += SERVICE_BATCH) {
          await wait(await call("POST", `${USAGE}/projects/${projectId}/services:batchEnable`, { body: { serviceIds: names.slice(i, i + SERVICE_BATCH) } }), USAGE);
        }
      },
    },
    firestore: {
      async getDatabase(projectId, databaseId = "(default)") {
        const database = await orNull(call("GET", `${FIRESTORE_ADMIN}/projects/${projectId}/databases/${databaseId}`));
        return database ? { locationId: database.locationId, type: database.type, deleteProtection: database.deleteProtectionState === "DELETE_PROTECTION_ENABLED" } : null;
      },
      async createDatabase(projectId, { locationId, type, deleteProtection, databaseId = "(default)" }) {
        const body = { locationId, type, deleteProtectionState: deleteProtection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED" };
        await wait(await call("POST", `${FIRESTORE_ADMIN}/projects/${projectId}/databases`, { query: { databaseId }, body }), FIRESTORE_ADMIN);
      },
    },
    storage: {
      async getDefaultBucket(projectId) {
        const found = await orNull(call("GET", `${FIREBASE_STORAGE}/projects/${projectId}/defaultBucket`));
        return found ? { name: found.bucket?.name?.split("/").at(-1) ?? "", location: found.location } : null;
      },
      async createDefaultBucket(projectId, { location }) {
        await call("POST", `${FIREBASE_STORAGE}/projects/${projectId}/defaultBucket`, { body: { location } });
      },
      // Bucket names are shared by everyone on Google Cloud. A bucket in another project answers 403 to us, or names
      // another project number: either way `project` is not this project, and step 5 stops for a person.
      async getBucket(projectId, name) {
        let bucket;
        try {
          bucket = await call("GET", `${GCS}/b/${encodeURIComponent(name)}`);
        } catch (error) {
          if (isNotFound(error)) return null;
          if (error instanceof GoogleError && error.status === 403) return { name, location: "", project: null };
          throw error;
        }
        const ours = String(bucket.projectNumber) === String(await projectNumber(projectId));
        return { name: bucket.name, location: bucket.location, project: ours ? projectId : null };
      },
      // Made with uniform access (rules decide who reads it), then added to Firebase so its storage rules apply.
      async createBucket(projectId, { name, location }) {
        await call("POST", `${GCS}/b`, { query: { project: projectId }, body: { name, location, iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } } });
        await call("POST", `${FIREBASE_STORAGE}/projects/${projectId}/buckets/${name}:addFirebase`, { body: {} });
      },
    },
    // The project's default Realtime Database instance (<project id>-default-rtdb), which the stockroom uses.
    realtimeDatabase: {
      async getInstance(projectId) {
        const instances = [];
        let pageToken;
        do {
          const page = await call("GET", `${RTDB}/projects/${projectId}/locations/-/instances`, { query: { pageToken } });
          instances.push(...(page.instances ?? []));
          pageToken = page.nextPageToken;
        } while (pageToken);
        const found = instances.find((i) => i.type === "DEFAULT_DATABASE");
        if (!found) return null;
        const [, , , location, , id] = found.name.split("/");
        return { name: id, location };
      },
      async createInstance(projectId, { location }) {
        await call("POST", `${RTDB}/projects/${projectId}/locations/${location}/instances`, {
          query: { databaseId: `${projectId}-default-rtdb` },
          body: { type: "DEFAULT_DATABASE" },
        });
      },
    },
    backups: {
      async hasPermission(projectId) {
        const member = await backupAccount(projectId);
        const policy = await call("POST", `${RM}/projects/${projectId}:getIamPolicy`, { body: { options: { requestedPolicyVersion: 3 } } });
        return (policy.bindings ?? []).some((b) => b.role === BACKUP_ROLE && !b.condition && (b.members ?? []).includes(member));
      },
      // Read, add one member, write back with the policy's etag: a policy changed in between is refused by Google
      // (409/ABORTED), and the step is simply run again.
      async grantPermission(projectId) {
        const member = await backupAccount(projectId);
        const policy = await call("POST", `${RM}/projects/${projectId}:getIamPolicy`, { body: { options: { requestedPolicyVersion: 3 } } });
        const bindings = structuredClone(policy.bindings ?? []);
        const binding = bindings.find((b) => b.role === BACKUP_ROLE && !b.condition);
        if (binding?.members?.includes(member)) return;
        if (binding) binding.members = [...(binding.members ?? []), member];
        else bindings.push({ role: BACKUP_ROLE, members: [member] });
        await call("POST", `${RM}/projects/${projectId}:setIamPolicy`, { body: { policy: { ...policy, bindings, version: 3 }, updateMask: "bindings,etag" } });
      },
      // The shop's own backups go to backups/<day>/ in its bucket (apps/shop/functions/backupAdmin.js).
      async latest(projectId) {
        const bucket = await needBucket(projectId);
        const listing = await call("GET", `${GCS}/b/${bucket}/o`, { query: { prefix: "backups/", delimiter: "/" } });
        const days = (listing.prefixes ?? []).filter((p) => /^backups\/\d{4}-\d{2}-\d{2}\/$/.test(p)).sort();
        return days.length ? { name: days.at(-1) } : null;
      },
      // `database` names another of the project's databases (the stockroom's, plan 1.20); its export goes next to the
      // shop's, as backups/<day>/<database>-export.
      async run(projectId, { database = "(default)" } = {}) {
        const bucket = await needBucket(projectId);
        const folder = `backups/${today()}/`;
        const out = database === "(default)" ? "export" : `${database}-export`;
        const operation = await call("POST", `${FIRESTORE_ADMIN}/projects/${projectId}/databases/${database}:exportDocuments`, {
          body: { outputUriPrefix: `gs://${bucket}/${folder}${out}`, collectionIds: [] },
        });
        await wait(operation, FIRESTORE_ADMIN);
        return { name: folder };
      },
    },
    // The shop's Functions secrets (the functions read them as environment variables). Only the service key is written
    // here; its value is never logged.
    secrets: {
      /** The newest version's value, or null when the secret or its versions don't exist. */
      async latest(projectId, name) {
        const found = await orNull(call("GET", `${SECRETS}/projects/${projectId}/secrets/${name}/versions/latest:access`));
        const data = found?.payload?.data;
        return typeof data === "string" ? Buffer.from(data, "base64").toString("utf8") : null;
      },
      /** Adds a version holding `value`, creating the secret first when it is missing. */
      async add(projectId, name, value) {
        const secret = `${SECRETS}/projects/${projectId}/secrets`;
        try {
          await call("POST", secret, { query: { secretId: name }, body: { replication: { automatic: {} } } });
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
        await call("POST", `${secret}/${name}:addVersion`, { body: { payload: { data: Buffer.from(String(value), "utf8").toString("base64") } } });
      },
    },
    // A press's own web address on the shop's default Hosting site (the site id is the project id). Only the domain
    // service's remove (plan 5.9) calls removeDomain, for an address in that shop's own registry row.
    hosting: {
      /** The custom domain as Google sees it (hostState, ownershipState, cert, requiredDnsUpdates), or null. */
      async getDomain(projectId, domain) {
        return orNull(call("GET", `${HOSTING}/projects/${projectId}/sites/${projectId}/customDomains/${encodeURIComponent(domain)}`));
      },
      /** Starts connecting `domain`; one that is already there is left as it is. */
      async addDomain(projectId, domain) {
        try {
          await call("POST", `${HOSTING}/projects/${projectId}/sites/${projectId}/customDomains`, { query: { customDomainId: domain }, body: {} });
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
      },
      /** Stops serving the shop at `domain`; one that is already gone is fine. */
      async removeDomain(projectId, domain) {
        try {
          await call("DELETE", `${HOSTING}/projects/${projectId}/sites/${projectId}/customDomains/${encodeURIComponent(domain)}`);
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      },
    },
    storageProbe: {
      async hasTestFile(projectId) {
        const bucket = await defaultBucket(projectId);
        return Boolean(bucket && (await orNull(call("GET", `${GCS}/b/${bucket}/o/${encodeURIComponent(PROBE_FILE)}`))));
      },
      async writeTestFile(projectId) {
        const bucket = await needBucket(projectId);
        await call("POST", `${GCS_UPLOAD}/b/${bucket}/o`, {
          query: { uploadType: "media", name: PROBE_FILE },
          raw: "This file proves the shop's stored files are private. Reading it without signing in must be refused.",
          contentType: "text/plain",
        });
      },
      // No token: this is what a stranger's browser gets.
      async readUnsigned(projectId) {
        const bucket = await needBucket(projectId);
        const response = await fetch(`${FILES}/b/${bucket}/o/${encodeURIComponent(PROBE_FILE)}?alt=media`, { method: "GET" });
        return { status: response.status };
      },
    },
  };
}
