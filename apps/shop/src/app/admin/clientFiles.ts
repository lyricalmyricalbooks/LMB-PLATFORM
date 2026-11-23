// Client files on the client card (Bookings plan 4, 3.2): PDFs, documents and pictures kept with one client, such as a
// signed contract, a doctor's note or a brief. Private to the shop: admin-only `clientFiles` records (firestore.rules)
// and files in the admin-only `client-files/` folder (storage.rules), opened through the signed-in Storage SDK, never a
// public link. Pure rules here; reads and writes in clientFilesApi.ts.

export type ClientFile = {
  id: string;
  /** sha256 of the lower-case email, as `customerNotes` and `clientVisits`. */
  client: string;
  email: string;
  /** The name the owner sees (the file's own name when it was added, or what they renamed it to). */
  name: string;
  path: string;
  size: number;
  type: string;
  addedAt: string;
};

export const MAX_CLIENT_FILES = 30;
/** Storage refuses anything bigger (storage.rules). */
export const MAX_CLIENT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_NAME = 120;
export const CLIENT_FILE_FOLDER = "client-files";

/** The kinds a file may be, by type. Storage checks the same list (storage.rules client-files). */
export const CLIENT_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.oasis.opendocument.text": "Document",
  "application/rtf": "Document",
  "text/plain": "Text",
  "application/vnd.ms-excel": "Spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Spreadsheet",
  "text/csv": "Spreadsheet",
  "image/jpeg": "Picture",
  "image/png": "Picture",
  "image/heic": "Picture",
  "image/webp": "Picture",
  "image/gif": "Picture",
};
/** Types worked out from the end of the name, for browsers that hand over no type (often Word files on Windows). */
const BY_ENDING: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text", rtf: "application/rtf", txt: "text/plain", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", heic: "image/heic", webp: "image/webp", gif: "image/gif",
};
/** What the file chooser offers. */
export const CLIENT_FILE_ACCEPT = Object.keys(BY_ENDING).map((e) => `.${e}`).join(",");

const HASH = /^[0-9a-f]{64}$/;

/** The folder a client's files live in (inside the shop's own folder). */
export const clientFileFolder = (client: string) => `${CLIENT_FILE_FOLDER}/${client}`;

/** A path inside this client's own folder: no other path is ever saved, opened or deleted. */
export function ownFilePath(client: string, path: unknown): path is string {
  if (typeof path !== "string" || !HASH.test(client)) return false;
  const prefix = `${clientFileFolder(client)}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length));
}

/** The file's type, from the browser or else from the end of its name; "" when it isn't one we keep. */
export function fileTypeOf(file: { name: string; type?: string }): string {
  const given = String(file.type || "").toLowerCase();
  if (CLIENT_FILE_TYPES[given]) return given;
  const ending = /\.([a-z0-9]{1,5})$/i.exec(file.name || "")?.[1]?.toLowerCase() || "";
  return BY_ENDING[ending] || "";
}

/** The short word for a type: PDF, Word, Picture… */
export const kindWord = (type: string) => CLIENT_FILE_TYPES[type] || "File";

/** Why a file can't be added, in the owner's words, or "" when it can. */
export function fileProblem(file: { name: string; type?: string; size: number }): string {
  if (!fileTypeOf(file)) return `${file.name || "This file"} isn't a PDF, document, spreadsheet or picture.`;
  if (file.size <= 0) return `${file.name || "This file"} is empty.`;
  if (file.size > MAX_CLIENT_FILE_BYTES) return `${file.name || "This file"} is over 20 MB.`;
  return "";
}

/** A name to show: trimmed, one line, at most MAX_FILE_NAME characters; never empty. */
export function cleanFileName(name: unknown, fallback = "File"): string {
  const one = String(name ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return (one || fallback).slice(0, MAX_FILE_NAME);
}

/** A unique stored name: never overwritten, keeps the ending so the file opens in the right program. */
export function storedFileName(name: string, nowMs: number, rand: string): string {
  const ending = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() || "bin";
  return `file-${nowMs}-${rand.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "x"}.${ending}`;
}

/** "320 KB", "4.2 MB". */
export function sizeWords(bytes: number): string {
  if (!(bytes > 0)) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** What a save writes, or the owner's words for what is wrong. */
export function cleanClientFile(input: { client: string; email: string; name: string; path: string; size: number; type: string; addedAt: string }):
  { problem: string } | { file: Omit<ClientFile, "id"> } {
  if (!HASH.test(input.client)) return { problem: "Unknown client." };
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || email.length > 254) return { problem: "Unknown client." };
  if (!ownFilePath(input.client, input.path)) return { problem: "That file isn't in this client's folder." };
  if (!CLIENT_FILE_TYPES[input.type]) return { problem: "That kind of file can't be kept here." };
  if (!(input.size > 0) || input.size > MAX_CLIENT_FILE_BYTES) return { problem: "Files can be up to 20 MB." };
  return { file: { client: input.client, email, name: cleanFileName(input.name), path: input.path, size: Math.round(input.size), type: input.type, addedAt: input.addedAt } };
}

/** Newest first. */
export function sortFiles(list: readonly ClientFile[]): ClientFile[] {
  return [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.name.localeCompare(b.name));
}

/** The name a download saves under: the shown name, with the stored ending when the shown one lost it. */
export function downloadName(file: Pick<ClientFile, "name" | "path">): string {
  const ending = /\.([a-z0-9]{1,5})$/i.exec(file.path)?.[1] || "";
  const name = cleanFileName(file.name).replace(/[\\/:*?"<>|]+/g, "-");
  return ending && !name.toLowerCase().endsWith(`.${ending.toLowerCase()}`) ? `${name}.${ending}` : name;
}
