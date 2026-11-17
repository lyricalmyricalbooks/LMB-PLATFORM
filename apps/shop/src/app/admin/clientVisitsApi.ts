// Visit notes and photos on the client card (clientVisits.ts): the admin-only `clientVisits` records and the
// `client-photos/` files. One object so the admin fixture (src/adminFixture/main.ts) can swap in sample visits.
// Photos are read with the signed-in Storage SDK (getBlob), never a download link: a link works for anyone who has it.
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { shopFilePath } from "../../lib/shopFolder";
import { cleanVisit, clientPhotoFolder, droppedPhotos, ownPhotoPath, photoFileName, sortVisits, type ClientVisit, type VisitPhoto } from "./clientVisits";
import { prepareProductImage } from "./prepareImage";

async function storage() {
  const [{ getStorage, ref, uploadBytes, getBlob, deleteObject }, { getApp }] = await Promise.all([import("firebase/storage"), import("firebase/app")]);
  const at = (path: string) => ref(getStorage(getApp()), shopFilePath(path));
  return { at, uploadBytes, getBlob, deleteObject };
}

export const clientVisitsData = {
  async list(client: string): Promise<ClientVisit[]> {
    const snap = await getDocs(query(collection(db, "clientVisits"), where("client", "==", client), limit(200)));
    return sortVisits(snap.docs.map((d) => ({ ...(d.data() as Omit<ClientVisit, "id">), id: d.id })));
  },
  async write(id: string | null, record: Omit<ClientVisit, "id">): Promise<string> {
    const ref = id ? doc(db, "clientVisits", id) : doc(collection(db, "clientVisits"));
    await setDoc(ref, record);
    return ref.id;
  },
  async erase(id: string): Promise<void> {
    await deleteDoc(doc(db, "clientVisits", id));
  },
  /** Shrinks the photo (2400 px at most) and keeps it in the client's private folder; returns its path. */
  async upload(client: string, kind: VisitPhoto["kind"], file: File): Promise<string> {
    const small = await prepareProductImage(file);
    const path = `${clientPhotoFolder(client)}/${photoFileName(kind, Date.now(), Math.random().toString(36).slice(2))}`;
    const s = await storage();
    await s.uploadBytes(s.at(path), small, { contentType: small.type || "image/jpeg", cacheControl: "private, max-age=3600" });
    return path;
  },
  /** A page-only address for one photo (revoke it when done). */
  async photoUrl(path: string): Promise<string> {
    const s = await storage();
    return URL.createObjectURL(await s.getBlob(s.at(path)));
  },
  /** Removes files; one already gone counts as removed. Never throws: a left-over file only takes space. */
  async removeFiles(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const s = await storage();
    await Promise.all(paths.map((p) => s.deleteObject(s.at(p)).catch(() => undefined)));
  },
};

export const listClientVisits = (client: string) => clientVisitsData.list(client);
export const uploadClientPhoto = (client: string, kind: VisitPhoto["kind"], file: File) => clientVisitsData.upload(client, kind, file);
export const clientPhotoUrl = (path: string) => clientVisitsData.photoUrl(path);

/**
 * Saves a visit (new when `previous` is null) and then removes the photos the save took off. Returns the saved visit,
 * or the owner's words for what is wrong.
 */
export async function saveClientVisit(
  input: { client: string; email: string; day: string; note: string; photos: VisitPhoto[] },
  previous: ClientVisit | null,
): Promise<{ visit: ClientVisit } | { problem: string }> {
  const clean = cleanVisit(input);
  if ("problem" in clean) return clean;
  const now = new Date().toISOString();
  const record = { ...clean.visit, createdAt: previous?.createdAt || now, updatedAt: now };
  const id = await clientVisitsData.write(previous?.id || null, record);
  if (previous) await clientVisitsData.removeFiles(droppedPhotos(previous.photos, record.photos));
  return { visit: { ...record, id } };
}

/** Deletes the visit, then its photos. */
export async function deleteClientVisit(visit: ClientVisit): Promise<void> {
  await clientVisitsData.erase(visit.id);
  await clientVisitsData.removeFiles(visit.photos.map((p) => p.path).filter((p) => ownPhotoPath(visit.client, p)));
}
