// The demo keeps the stockroom's own Firestore database between runs. The emulators' --export-on-exit saves only the
// default database (firebase-tools 15.32.1 asks the Firestore emulator for `databases/(default)` and nothing else), so
// the stockroom's named database would start empty every time. run.js saves it here instead: every document, read
// through the emulator's REST API with its "owner" token (which passes the rules), written to one JSON file, and written
// back the next time before seeding. Fields are kept exactly as the emulator gives them, so every value type survives.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const PAGE = 300;
const BATCH = 400; // a Firestore commit takes at most 500 writes
const OWNER = { Authorization: "Bearer owner" };

async function answer(response, what) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what} answered ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Reads every document of one database: [{ path, fields }], parents before children. Documents that exist only as
 * the parent of a subcollection are walked through but not saved.
 */
export async function dumpDatabase({ fetch, base, projectId, database }) {
  const root = `${base}/v1/projects/${projectId}/databases/${database}/documents`;
  const out = [];
  const collectionIds = async (parent) => {
    const ids = [];
    let pageToken;
    do {
      const body = await answer(await fetch(`${parent ? `${root}/${parent}` : root}:listCollectionIds`, {
        method: "POST",
        headers: { ...OWNER, "Content-Type": "application/json" },
        body: JSON.stringify({ pageSize: PAGE, ...(pageToken ? { pageToken } : {}) }),
      }), "The Firestore emulator");
      ids.push(...(body.collectionIds ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return ids;
  };
  const walk = async (parent) => {
    for (const id of await collectionIds(parent)) {
      const collection = parent ? `${parent}/${id}` : id;
      let pageToken;
      do {
        const query = new URLSearchParams({ pageSize: String(PAGE), showMissing: "true", ...(pageToken ? { pageToken } : {}) });
        const body = await answer(await fetch(`${root}/${collection}?${query}`, { headers: OWNER }), "The Firestore emulator");
        for (const doc of body.documents ?? []) {
          const path = doc.name.slice(doc.name.indexOf("/documents/") + "/documents/".length);
          if (doc.createTime) out.push({ path, fields: doc.fields ?? {} });
          await walk(path);
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
    }
  };
  await walk("");
  return out;
}

/** Writes the documents back, each one whole, in batches. */
export async function restoreDatabase({ fetch, base, projectId, database, documents }) {
  const name = `projects/${projectId}/databases/${database}/documents`;
  for (let i = 0; i < documents.length; i += BATCH) {
    const writes = documents.slice(i, i + BATCH).map(({ path, fields }) => ({ update: { name: `${name}/${path}`, fields } }));
    await answer(await fetch(`${base}/v1/${name}:commit`, {
      method: "POST",
      headers: { ...OWNER, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    }), "The Firestore emulator");
  }
  return documents.length;
}

/** The saved copy, or null when there is none (or it can't be read: then the demo starts that database afresh). */
export function readSaved(file) {
  if (!existsSync(file)) return null;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(saved?.documents) ? saved : null;
  } catch {
    return null;
  }
}

/** Saves a full read only, through a temporary file, so a stop halfway never leaves half a copy. */
export function writeSaved(file, { database, documents, now = new Date() }) {
  const temp = `${file}.saving`;
  writeFileSync(temp, `${JSON.stringify({ database, savedAt: now.toISOString(), documents }, null, 1)}\n`);
  renameSync(temp, file);
}

/**
 * Keeps one database: `restore()` once the emulators are up, `save()` whenever (run.js saves every few seconds and at
 * Ctrl+C). A save that fails, say because the emulators are already stopping, keeps the last good copy.
 */
export function keepDatabase({ fetch, base, projectId, database, file }) {
  let last = null;
  let queue = Promise.resolve(true);
  const saveNow = async () => {
    let documents;
    try {
      documents = await dumpDatabase({ fetch, base, projectId, database });
    } catch {
      return false;
    }
    const text = JSON.stringify(documents);
    if (text === last) return true;
    try {
      writeSaved(file, { database, documents });
    } catch {
      return false;
    }
    last = text;
    return true;
  };
  return {
    async restore() {
      const saved = readSaved(file);
      if (!saved || saved.database !== database || !saved.documents.length) return 0;
      const count = await restoreDatabase({ fetch, base, projectId, database, documents: saved.documents });
      last = JSON.stringify(saved.documents);
      return count;
    },
    // One save at a time: a timed save still running when Ctrl+C asks for another is followed, not overlapped.
    save() {
      queue = queue.then(saveNow);
      return queue;
    },
  };
}
