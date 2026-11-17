// Visit notes and photos on the client card (Services plan 2, extras): a colour formula or session note for one visit,
// with before and after photos. Private to the shop: admin-only `clientVisits` records (firestore.rules) and photos in
// the admin-only `client-photos/` folder (storage.rules), shown through the signed-in Storage SDK, never a public link.
// Pure rules here; reads and writes in api.ts (listClientVisits, saveClientVisit, deleteClientVisit).

export type VisitPhoto = { path: string; kind: "before" | "after" };
export type ClientVisit = {
  id: string;
  /** sha256 of the lower-case email, as `customerNotes` (Customers.tsx emailHash). */
  client: string;
  email: string;
  /** The visit's day, YYYY-MM-DD (shop day). */
  day: string;
  note: string;
  photos: VisitPhoto[];
  createdAt: string;
  updatedAt: string;
};

export const MAX_VISIT_NOTE = 4000;
export const MAX_VISIT_PHOTOS = 8;
/** Storage refuses anything bigger (storage.rules); photos are shrunk to 2400 px before upload, so this is a ceiling. */
export const MAX_CLIENT_PHOTO_BYTES = 12 * 1024 * 1024;
export const CLIENT_PHOTO_FOLDER = "client-photos";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;

/** The folder a client's photos live in (inside the shop's own folder). */
export const clientPhotoFolder = (client: string) => `${CLIENT_PHOTO_FOLDER}/${client}`;

/** A photo path that belongs to this client's folder: no other path is ever saved, shown or deleted. */
export function ownPhotoPath(client: string, path: unknown): path is string {
  if (typeof path !== "string" || !HASH.test(client)) return false;
  const prefix = `${clientPhotoFolder(client)}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length));
}

/** What a save writes: trimmed note, a real day, at most MAX_VISIT_PHOTOS own photos. A problem is the owner's words. */
export function cleanVisit(input: { client: string; email: string; day: string; note: string; photos: VisitPhoto[] }):
  { problem: string } | { visit: Omit<ClientVisit, "id" | "createdAt" | "updatedAt"> } {
  if (!HASH.test(input.client)) return { problem: "Unknown client." };
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || email.length > 254) return { problem: "Unknown client." };
  if (!DAY.test(input.day) || Number.isNaN(Date.parse(`${input.day}T12:00:00Z`))) return { problem: "Pick the day of the visit." };
  const note = String(input.note || "").trim();
  if (note.length > MAX_VISIT_NOTE) return { problem: `Keep the note under ${MAX_VISIT_NOTE} characters.` };
  const seen = new Set<string>();
  const photos = (input.photos || []).filter((p) => p && (p.kind === "before" || p.kind === "after") && ownPhotoPath(input.client, p.path) && !seen.has(p.path) && seen.add(p.path))
    .map((p) => ({ path: p.path, kind: p.kind }));
  if (photos.length > MAX_VISIT_PHOTOS) return { problem: `Up to ${MAX_VISIT_PHOTOS} photos a visit.` };
  if (!note && !photos.length) return { problem: "Add a note or a photo." };
  return { visit: { client: input.client, email, day: input.day, note, photos } };
}

/** Newest visit first; the same day keeps the one written last on top. */
export function sortVisits(list: readonly ClientVisit[]): ClientVisit[] {
  return [...list].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
}

/** Photos a save took off: the files to delete once the record no longer names them. */
export function droppedPhotos(before: readonly VisitPhoto[], after: readonly VisitPhoto[]): string[] {
  const kept = new Set(after.map((p) => p.path));
  return before.map((p) => p.path).filter((p) => !kept.has(p));
}

/** A unique file name for one upload (never overwritten, so the browser can keep it). */
export function photoFileName(kind: VisitPhoto["kind"], nowMs: number, rand: string): string {
  return `${kind}-${nowMs}-${rand.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "x"}.jpg`;
}
