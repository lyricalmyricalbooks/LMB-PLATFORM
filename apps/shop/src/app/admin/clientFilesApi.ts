// Client files on the client card (clientFiles.ts): the admin-only `clientFiles` records and the `client-files/` folder.
// One object so the admin fixture (src/adminFixture/main.ts) can swap in sample files. Files are read with the
// signed-in Storage SDK (getBlob), never a download link: a link works for anyone who has it.
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { shopFilePath } from "../../lib/shopFolder";
import { cleanClientFile, cleanFileName, clientFileFolder, fileTypeOf, MAX_CLIENT_FILES, ownFilePath, sortFiles, storedFileName, type ClientFile } from "./clientFiles";

async function storage() {
  const [{ getStorage, ref, uploadBytes, getBlob, deleteObject }, { getApp }] = await Promise.all([import("firebase/storage"), import("firebase/app")]);
  const at = (path: string) => ref(getStorage(getApp()), shopFilePath(path));
  return { at, uploadBytes, getBlob, deleteObject };
}

export const clientFilesData = {
  async list(client: string): Promise<ClientFile[]> {
    const snap = await getDocs(query(collection(db, "clientFiles"), where("client", "==", client), limit(MAX_CLIENT_FILES + 10)));
    return sortFiles(snap.docs.map((d) => ({ ...(d.data() as Omit<ClientFile, "id">), id: d.id })));
  },
  async write(record: Omit<ClientFile, "id">): Promise<string> {
    const ref = doc(collection(db, "clientFiles"));
    await setDoc(ref, record);
    return ref.id;
  },
  async rename(id: string, name: string): Promise<void> {
    await updateDoc(doc(db, "clientFiles", id), { name });
  },
  async erase(id: string): Promise<void> {
    await deleteDoc(doc(db, "clientFiles", id));
  },
  /** Keeps the file in the client's private folder as it is; returns its path. */
  async upload(client: string, file: File, type: string): Promise<string> {
    const path = `${clientFileFolder(client)}/${storedFileName(file.name, Date.now(), Math.random().toString(36).slice(2))}`;
    const s = await storage();
    await s.uploadBytes(s.at(path), file, { contentType: type, cacheControl: "private, max-age=3600" });
    return path;
  },
  /** The file itself, for opening in a new tab or saving. */
  async blob(path: string): Promise<Blob> {
    const s = await storage();
    return s.getBlob(s.at(path));
  },
  /** Removes files; one already gone counts as removed. Never throws: a left-over file only takes space. */
  async removeFiles(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const s = await storage();
    await Promise.all(paths.map((p) => s.deleteObject(s.at(p)).catch(() => undefined)));
  },
};

/** Uploads one file and saves its record. Returns the saved file, or the owner's words for what is wrong. */
export async function addClientFile(client: string, email: string, file: File): Promise<{ file: ClientFile } | { problem: string }> {
  const type = fileTypeOf(file);
  const path = await clientFilesData.upload(client, file, type);
  const clean = cleanClientFile({ client, email, name: file.name, path, size: file.size, type, addedAt: new Date().toISOString() });
  if ("problem" in clean) { await clientFilesData.removeFiles([path]); return clean; }
  try {
    const id = await clientFilesData.write(clean.file);
    return { file: { ...clean.file, id } };
  } catch (e) {
    // The record didn't save: the file would only take space.
    await clientFilesData.removeFiles([path]);
    throw e;
  }
}

export async function renameClientFile(file: ClientFile, name: string): Promise<ClientFile> {
  const clean = cleanFileName(name, file.name);
  await clientFilesData.rename(file.id, clean);
  return { ...file, name: clean };
}

/** Deletes the record, then its file (only a path inside the client's own folder). */
export async function deleteClientFile(file: ClientFile): Promise<void> {
  await clientFilesData.erase(file.id);
  if (ownFilePath(file.client, file.path)) await clientFilesData.removeFiles([file.path]);
}
