// Runs this shop's pending data changes against one Firebase project, as the platform's release runner does before it
// deploys new server code (services/release-runner):
//   node functions/migrations/run.js --project <project id> [--release <version>] [--dry-run]
// It signs in with the machine's Google application default credentials; no key is read from a file.
const crypto = require("crypto");
const { runMigrations } = require("./runner");

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

function parseArgs(argv) {
  const args = { dryRun: false, release: null, project: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i] || "";
    else if (argv[i] === "--release") args.release = argv[++i] || null;
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!PROJECT.test(args.project)) throw new Error(`"${args.project}" isn't a Firebase project id (use --project <id>)`);
  return args;
}

async function main(argv) {
  const { project, release, dryRun } = parseArgs(argv);
  const admin = require("../adminSdk")(require("firebase-admin"));
  admin.initializeApp({ projectId: project, credential: admin.credential.applicationDefault() });
  const result = await runMigrations({
    db: admin.firestore(), migrations: require("./list"), release, dryRun, runId: crypto.randomUUID(),
    log: line => console.log(`[${project}] ${line}`),
  });
  console.log(JSON.stringify(result));
  return result;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    result => { process.exitCode = result.ok ? 0 : 1; },
    error => { console.error(error.message); process.exitCode = 1; },
  );
}

module.exports = { parseArgs, main };
