// The shared system (LMB-PLATFORM docs/shared-system.md): every shop lives in one Firebase project, each in its own
// folder, `shops/<shopId>`, in the database and in file storage. The shop id comes from the shop profile the page
// opened with. Everything the shop reads or writes goes through this folder: `db` in ./firebase and `liteDb` in
// ./firestoreLite are the folder's document, and every file path goes through shopFilePath.

import { shopProfile } from "./shopProfile";

/** A shop id as the platform makes them: lower-case letters, digits and dashes. Anything else would escape the folder. */
const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The folder for a shop id. Throws on an id that isn't one, so a broken profile can never point at the database root. */
export function shopFolderOf(shopId: string): string {
  if (!SHOP_ID.test(shopId)) throw new Error(`"${shopId}" isn't a shop id.`);
  return `shops/${shopId}`;
}

export const SHOP_FOLDER = shopFolderOf(shopProfile.shopId);

/** A path in this shop's file folder. A path already in it is returned as it is (paths read back from file addresses). */
export function shopFilePath(path: string, folder: string = SHOP_FOLDER): string {
  const clean = path.replace(/^\/+/, "");
  return clean.startsWith(`${folder}/`) ? clean : `${folder}/${clean}`;
}

/** A file path without this shop's folder in front (the path the shop's own code names), or the path as it is. */
export function inShopFolder(path: string, folder: string = SHOP_FOLDER): string {
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
}
