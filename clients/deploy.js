// The shop maker's `deploy` client (setup/later-steps.js, steps 7–9) and the release runner's deploys.
//
// What is live is read over REST, from the stamp each deploy leaves (endpoints from the discovery documents):
//   rules      Firebase Rules v1   projects.releases.get  GET v1/projects/{p}/releases/cloud.firestore
//                                  projects.rulesets.get  GET v1/{rulesetName}  -> source.files[].content
//              stamp: a first-line comment in firestore.rules, `// lmb-release: {"version":"…","apps":[…]}`, written
//              by the release build (services/release-runner).
//   functions  Cloud Functions v2  projects.locations.functions.list  GET v2/projects/{p}/locations/-/functions
//              stamp: the SHOP_RELEASE_VERSION variable in each function's environment (serviceConfig.environmentVariables);
//              the region is the function name's location.
//   pages      Firebase Hosting v1beta1  sites.releases.list  GET v1beta1/sites/{site}/releases?pageSize=1
//              stamp: the release message `lmb-release <version>`.
//              projects.sites.get / projects.sites.create (siteId) make the stockroom's own site.
//
// Deploying itself goes through the Firebase command line (`firebase deploy`), run in the release's build folder by
// an injected `run(command, args, { cwd, env })`. Cloud Functions need their source built and uploaded, and Hosting
// needs every file hashed and uploaded; the command line does both the way the shop's own deploy workflow does. The
// Hosting upload over REST (populateFiles, then the upload address) could not be confirmed from Google's docs from
// here, so it is not hand-written. The command line signs in with the runner's application default credentials.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { googleHttp, isNotFound } from "./http.js";

const RULES = "https://firebaserules.googleapis.com/v1";
const FUNCTIONS = "https://cloudfunctions.googleapis.com/v2";
const HOSTING = "https://firebasehosting.googleapis.com/v1beta1";

export const RULES_STAMP = /^\/\/ lmb-release: (\{.*\})\s*$/m;
export const RELEASE_MESSAGE = /^lmb-release (\S+)$/;

/** The stamp line the release build puts at the top of a shop's firestore.rules. */
export const rulesStamp = ({ version, apps }) => `// lmb-release: ${JSON.stringify({ version, apps })}`;

/** The Hosting site of one app: the project's own default site for the shop, `<project>-stockroom` for the stockroom. */
export const siteOf = (projectId, app) => (app === "shop" ? projectId : `${projectId}-${app}`);

/**
 * `deployClient({ fetch, token, run, buildDir, writeText })`. `buildDir(version)` is the folder the release was built
 * in once (apps/shop and apps/stockroom inside it, each with its `firebase.deploy.json`).
 */
export function deployClient({ fetch, token, run, buildDir, writeText = writeFile }) {
  const call = googleHttp({ fetch, token });
  const firebase = async (version, app, args) => {
    const cwd = join(buildDir(version), "apps", app);
    await run("firebase", [...args, "--config", "firebase.deploy.json", "--non-interactive", "--force"], { cwd });
  };

  async function deployedRules(projectId) {
    let release;
    try {
      release = await call("GET", `${RULES}/projects/${projectId}/releases/cloud.firestore`);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const ruleset = await call("GET", `${RULES}/${release.rulesetName}`);
    for (const file of ruleset.source?.files ?? []) {
      const stamp = RULES_STAMP.exec(file.content ?? "");
      if (stamp) return JSON.parse(stamp[1]);
    }
    // Rules deployed by hand or by an older shop maker: live, but no release a step can match.
    return { version: "unknown", apps: [] };
  }

  async function deployedFunctions(projectId) {
    const found = [];
    let pageToken;
    do {
      const page = await call("GET", `${FUNCTIONS}/projects/${projectId}/locations/-/functions`, { query: { pageToken } });
      found.push(...(page.functions ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (!found.length) return null;
    const versions = new Set(found.map((f) => f.serviceConfig?.environmentVariables?.SHOP_RELEASE_VERSION ?? "unknown"));
    const regions = new Set(found.map((f) => f.name.split("/")[3]));
    // Mixed releases or regions are reported as they are, so a step stops for a person.
    return { version: [...versions].join("+"), region: [...regions].join("+") };
  }

  async function deployedPages(projectId, app) {
    const site = siteOf(projectId, app);
    let page;
    try {
      page = await call("GET", `${HOSTING}/sites/${site}/releases`, { query: { pageSize: 1 } });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const latest = page.releases?.[0];
    if (!latest) return null;
    return { version: RELEASE_MESSAGE.exec(latest.message ?? "")?.[1] ?? "unknown", url: `https://${site}.web.app` };
  }

  return {
    async deployed(projectId, part) {
      if (part === "rules") return deployedRules(projectId);
      if (part === "functions") return deployedFunctions(projectId);
      const app = /^pages:(shop|stockroom)$/.exec(part)?.[1];
      if (app) return deployedPages(projectId, app);
      throw new Error(`unknown deploy part ${part}`);
    },
    // The shop's rules and indexes, and the stockroom's when the plan has it: its named database, its bucket and the
    // Realtime Database, as its firebase.deploy.json names them (apps/stockroom/scripts/deployConfig.mjs, plan 1.20).
    async rules(projectId, { version, apps }) {
      for (const app of apps) await firebase(version, app, ["deploy", "--only", app === "shop" ? "firestore,storage" : "firestore,database,storage", "--project", projectId]);
    },
    // The env file is written next to the functions' code for this one deploy, with the release stamped in.
    async functions(projectId, { version, region, envFile }) {
      const dir = join(buildDir(version), "apps", "shop", "functions");
      await writeText(join(dir, `.env.${projectId}`), `${envFile.trimEnd()}\nSHOP_RELEASE_VERSION="${version}"\n`);
      await firebase(version, "shop", ["deploy", "--only", "functions", "--project", projectId]);
      const live = await deployedFunctions(projectId);
      if (live?.region !== region) throw new Error(`the server code went to ${live?.region ?? "nowhere"}, not ${region}; the shop copy must read SHOP_FUNCTIONS_REGION`);
    },
    async pages(projectId, { version, app }) {
      const site = siteOf(projectId, app);
      if (app !== "shop") {
        try {
          await call("GET", `${HOSTING}/projects/${projectId}/sites/${site}`);
        } catch (error) {
          if (!isNotFound(error)) throw error;
          await call("POST", `${HOSTING}/projects/${projectId}/sites`, { query: { siteId: site }, body: {} });
        }
      }
      await firebase(version, app, ["deploy", "--only", "hosting", "--project", projectId, "--message", `lmb-release ${version}`]);
      return { url: `https://${site}.web.app` };
    },
  };
}
