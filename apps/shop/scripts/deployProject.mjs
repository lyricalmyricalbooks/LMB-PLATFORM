// Which Firebase project a deploy goes to (plan 1.19). The deploy workflows take it as an input (a run started by hand
// or by the platform), else the repository variable FIREBASE_PROJECT_ID, else the shop profile's own project
// (public/shop-profile.js firebase.projectId). Whatever is asked for must be the profile's project: the pages built
// from this folder call that project, so deploying its rules, functions or Hosting anywhere else would split one shop
// across two projects (or put one press's shop in another's). A mismatch, or a malformed id, stops the deploy.
//   node scripts/deployProject.mjs [project id]   prints the project, or explains and exits 1
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShopProfileSync } from './shopProfile.mjs';

export const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** The project to deploy to, or throws with a plain explanation. */
export function deployProject(asked, profile = readShopProfileSync()) {
  const own = String(profile?.firebase?.projectId || '').trim();
  if (!PROJECT.test(own)) throw new Error('The shop profile (public/shop-profile.js) names no valid Firebase project.');
  const wanted = String(asked || '').trim();
  if (!wanted) return own;
  if (!PROJECT.test(wanted)) throw new Error(`"${wanted.slice(0, 40)}" isn't a Firebase project id.`);
  if (wanted !== own) throw new Error(`Asked to deploy to ${wanted}, but this shop's profile is for ${own}. Nothing was deployed.`);
  return wanted;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(deployProject(process.argv[2]));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
