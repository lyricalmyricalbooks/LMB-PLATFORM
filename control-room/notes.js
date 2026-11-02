// Notes and tags on a shop (code plan 19.13): the platform's own private notes about a press ("asked about wholesale",
// "call before the fair") and short tags to find shops by ("poetry", "big list", "needs help"). Platform admins only.
//
// Notes are private to the platform: they are never written to the shop's own audit log or to the registry's events,
// which a press can come to see. Every change is written to the control room's activity log (activity.js) instead,
// without the note's words.
//
//   addNote(claims, { shopId, words })            a note of up to 1000 characters
//   deleteNote(claims, { shopId, id, reason })    takes one note off, with a reason
//   setTags(claims, { shopId, tags, reason })     the shop's tags: up to 10, each a lowercase word or short phrase of up
//                                                 to 30 characters; the same tags again change nothing
//   notes(claims, { shopId })                     one shop's notes (newest first) and tags; without a shop id, every
//                                                 shop's tags, for the Shops list's pills and search
//
// Clients passed in:
//   store     the notes (visibilityFakes.js fakeShopNotes; clients/stores.js firestoreShopNotes):
//             get(shopId) -> { shopId, notes: [{ id, words, by, at }], tags: [] } | null; set(shopId, doc); list()
//   registry  getShop(shopId), so a note is only ever on a shop that exists
//   activity  record(entry)
import { randomUUID } from "node:crypto";
import { ControlError, MIN_REASON, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";

export const MAX_NOTE = 1000;
export const MAX_TAGS = 10;
export const MAX_TAG = 30;
const TAG = /^[a-z0-9][a-z0-9 &'-]*$/;

/** The tags as they are kept: trimmed, lowercase, single spaces, no repeats. Throws a ControlError with what's wrong. */
export function cleanTags(tags) {
  if (!Array.isArray(tags)) throw new ControlError(400, "Give the tags as a list.");
  const clean = [];
  for (const tag of tags) {
    const text = String(tag ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!text) continue;
    if (text.length > MAX_TAG) throw new ControlError(400, `Keep each tag to ${MAX_TAG} characters ("${text.slice(0, 40)}" is longer).`);
    if (!TAG.test(text)) throw new ControlError(400, `A tag is a word or a short phrase of letters and numbers ("${text}" isn't).`);
    if (!clean.includes(text)) clean.push(text);
  }
  if (clean.length > MAX_TAGS) throw new ControlError(400, `A shop can have up to ${MAX_TAGS} tags.`);
  return clean;
}

export function createShopNotes({ admins, store, registry, activity, now = () => new Date(), newId = () => randomUUID() }) {
  const at = () => now().toISOString();
  const record = async (by, what, shopId, detail) => (activity ? activity.record(activityEntry({ at: at(), by, what, shopId, detail })) : null);
  const reasonOf = (reason) => {
    const text = typeof reason === "string" ? reason.trim() : "";
    if (text.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the activity log.`);
    return text.slice(0, 500);
  };
  async function shopOr404(shopId) {
    if (typeof shopId !== "string" || !shopId || !(await registry.getShop(shopId))) throw new ControlError(404, "There's no shop with that id.");
  }
  const docOf = async (shopId) => (await store.get(shopId)) ?? { shopId, notes: [], tags: [] };

  return {
    async notes(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      if (shopId === undefined || shopId === null || shopId === "") {
        const tagsByShop = {};
        for (const doc of await store.list()) if (doc?.tags?.length) tagsByShop[doc.shopId] = doc.tags;
        return { tagsByShop };
      }
      await shopOr404(shopId);
      const doc = await docOf(shopId);
      return { shopId, notes: [...doc.notes].sort((a, b) => (a.at < b.at ? 1 : -1)), tags: doc.tags };
    },

    async addNote(claims, { shopId, words } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const text = typeof words === "string" ? words.trim() : "";
      if (!text) throw new ControlError(400, "Write the note first.");
      if (text.length > MAX_NOTE) throw new ControlError(400, `Keep a note to ${MAX_NOTE} characters.`);
      await shopOr404(shopId);
      const doc = await docOf(shopId);
      const note = { id: newId(), words: text, by, at: at() };
      await store.set(shopId, { ...doc, shopId, notes: [...doc.notes, note] });
      await record(by, "note-added", shopId, { noteId: note.id });
      return { note };
    },

    async deleteNote(claims, { shopId, id, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      await shopOr404(shopId);
      const doc = await docOf(shopId);
      const found = doc.notes.find((n) => n.id === id);
      if (!found) throw new ControlError(404, "That note isn't there. It may have been deleted already.");
      await store.set(shopId, { ...doc, notes: doc.notes.filter((n) => n.id !== id) });
      await record(by, "note-deleted", shopId, { noteId: id, reason: why, writtenBy: found.by, writtenAt: found.at });
      return { deleted: id };
    },

    async setTags(claims, { shopId, tags, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const clean = cleanTags(tags);
      const why = reasonOf(reason);
      await shopOr404(shopId);
      const doc = await docOf(shopId);
      if (doc.tags.length === clean.length && doc.tags.every((t, i) => t === clean[i])) return { tags: clean, changed: false };
      await store.set(shopId, { ...doc, shopId, tags: clean });
      await record(by, "tags-set", shopId, { tags: clean, was: doc.tags, reason: why });
      return { tags: clean, changed: true };
    },
  };
}

//   POST /api/control/notes         { shopId }: one shop's notes and tags; {}: every shop's tags
//   POST /api/control/notes/add     { shopId, words }
//   POST /api/control/notes/delete  { shopId, id, reason }
//   POST /api/control/tags          { shopId, tags, reason }
export function notesRoutes(notes) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/notes": (claims, request) => notes.notes(claims, body(request)),
    "POST /api/control/notes/add": (claims, request) => notes.addNote(claims, body(request)),
    "POST /api/control/notes/delete": (claims, request) => notes.deleteNote(claims, body(request)),
    "POST /api/control/tags": (claims, request) => notes.setTags(claims, body(request)),
  };
}
