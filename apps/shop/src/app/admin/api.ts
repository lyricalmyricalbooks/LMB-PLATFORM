import { duplicateBookData } from "./catalogList";
import type { OrderActionBody, RefundOrderBody } from "../../shared/orderActions";
import type { GiftCardBody, GiftCardOp } from "../../shared/giftCardActions";
import type { DiscountRecord } from "../../shared/discountMath";
import { discountRecord, discountUpdate } from "../../shared/discountRecord";
import { check } from "../../shared/edge";
import { changedBookFields, lockLinkedStock, removedBookFields, sameValue } from "./bookStockMerge";
import { PRIVATE_BOOK_KEYS, mergeBookPrivate, privateKeysIn, splitBookPrivate } from "./bookPrivate";
import { cleanRedirects, REDIRECTS_DOC, type Redirect } from "../features/site/redirects";
import { BOOK_FIELDS_DOC, cleanBookFields, type BookFieldDef } from "../features/site/bookFields";
import { alternatesFor, type AltBase, type AlternateTemplate } from "../features/site/templateAlternates";
import { newOrderAccessKey, rememberOrderAccess, orderAccessHeaders } from "../lib/orderAccessClient";
import { addressKey, addressIssues, packingKey, dispatchProblem, disputeOpen, queueOf, fulfillmentMethod, trackingFields } from "./fulfillment";
import { deleteRefusal } from "./orderListHelpers";
import { restampPreorderItems } from "../features/site/preorder";
import { themeWrite } from "./themeWrite";
import { draftFieldUpdate, readDraftField } from "./themeStore";
import { splitWebsiteSecrets, splitNotificationSecrets, resendKeyProblem, type SecretPatch } from "./privateKeys";
import { toCountryCodes } from "./shippingCountries";
import { keepPhotoCopies, removedPhotos, shownUrls, unusedBookFiles } from "./bookFileCleanup";
import { mediaApi } from "./mediaApi";
import { auditLog } from "./auditLog";
/** Cache-Control for uploaded shop pictures (mirrors functions/imageCopies.js IMMUTABLE). */
export const PUBLIC_FILE_CACHE = "public, max-age=31536000, immutable";

// Blank / invalid / negative -> null (rule off); otherwise the number.
const nonNegativeOrNull = (v: any) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
import { 
  collection, 
  collectionGroup,
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where,
  setDoc,
  getDoc,
  orderBy,
  documentId,
  limit,
  getCountFromServer,
  getAggregateFromServer,
  average,
  count as aggregateCount,
  startAfter,
  writeBatch,
  runTransaction,
  deleteField,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { db, auth, googleProvider } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { publicApi } from "../lib/publicApi";
import { defaultSettings } from "./defaultSettings";
// Storage + the legacy Realtime Database are admin-only and heavy; they are
// imported on demand so the public storefront bundle never downloads them.
const loadLegacy = () => import("../../lib/legacyFirebase");
import { CATEGORIES } from "../features/site/constants";
import { appendCategory, categoryBookPatch, directlyAssigned, type CategoryAction } from "./studio/categoryManager";
import { normalizeCategories } from "../features/site/navItems";
import { withRisoNoirDefault } from "../features/site/risoNoir";
import type { Page } from "../features/site/types";
import { validateLocalFulfillment } from "../features/site/localFulfillment";
import type { LocalFulfillmentConfig } from "../features/site/types";
import { dailyTrafficBetween } from "./dailyTrafficCache";

/** books/{id}/private/admin: cost prices, shelf codes and other fields shoppers must not read (bookPrivate.ts). */
const privateBookRef = (bookId: string) => doc(db, "books", bookId, "private", "admin");

/** Every book's private document, by book id. Empty (never an error) when the rules are not deployed yet or nothing has moved. */
async function readAllPrivateBookFields(): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  try {
    const snap = await getDocs(collectionGroup(db, "private"));
    snap.docs.forEach(d => { if (d.id === "admin" && d.ref.parent.parent) out.set(d.ref.parent.parent.id, d.data()); });
  } catch (err) {
    console.warn("Private book fields could not be read:", err);
  }
  return out;
}

/** deleteField() for each private key now stored in the private document, so the public record stops carrying it. */
const scrubPrivateKeys = (priv: Record<string, any>) => Object.fromEntries(privateKeysIn(priv).map(key => [key, deleteField()]));

// A discount write whose shape is wrong (src/shared/discountRecord.ts) is refused before it reaches Firestore.
function assertDiscountShape(result: { ok: true } | { ok: false; error: { path: string } }) {
  if (!result.ok) throw new Error(`The ${result.error.path || "discount"} field has the wrong kind of value, so nothing was saved`);
}

export const adminApi = {
  // Authentication
  login: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Restrict to authorized email
      if (user.email !== "lyricalmyricalbooks@gmail.com") {
        await signOut(auth);
        throw new Error("Unauthorized: Access restricted to lyricalmyricalbooks@gmail.com");
      }

      // Also sign into legacy inventory project using the same Google credential
      // so inventory sync can access the RTDB without a second login popup.
      try {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential) {
          const { legacyAuth } = await loadLegacy();
          await signInWithCredential(legacyAuth, credential);
        }
      } catch (legacyErr) {
        console.warn("Could not auto-sign into legacy project:", legacyErr);
      }
      
      return { token: await user.getIdToken(), user };
    } catch (err: any) {
      console.error("Login Error:", err);
      throw err;
    }
  },

  logout: () => signOut(auth),

  onAuthStateChange: (callback: (user: any) => void) => {
    return onAuthStateChanged(auth, callback);
  },

  // Nav badges: cheap server-side counts (single-field filters, no composite index). Each count fails
  // on its own as null so one refused read never hides the others.
  getAdminBadgeCounts: async () => {
    const count = (q: any) => getCountFromServer(q).then((s: any) => s.data().count as number).catch(() => null);
    const [pendingReviews, unreadMessages, openPrivacyRequests] = await Promise.all([
      count(query(collection(db, "reviews"), where("status", "==", "pending"))),
      count(query(collection(db, "contactMessages"), where("status", "in", ["new", "emailed"]))),
      count(query(collection(db, "privacyRequests"), where("status", "==", "open"))),
    ]);
    return { pendingReviews, unreadMessages, openPrivacyRequests };
  },

  // Books
  // Full catalog, including drafts and records without createdAt, for category management.
  getCategoryBooks: async () => {
    const snap = await getDocs(collection(db, "books"));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },

  updateCategoryBooks: async (ids: string[], source: any, action: CategoryAction, target?: any) => {
    if (auth.currentUser?.email !== "lyricalmyricalbooks@gmail.com") throw new Error("Admin sign-in is required.");
    const unique = [...new Set(ids)];
    if (unique.length > 400) throw new Error("More than 400 books are assigned here. Use Edit → Assigned here to move or remove up to 400 at a time, then retry deletion. No books were changed.");
    if (!source?.name || (action === "move" && (!target?.name || target.id === source.id))) throw new Error("Choose a different destination category.");
    if (!["add", "remove", "move"].includes(action)) throw new Error("Choose a valid category action.");
    // Read fresh tag fields and commit atomically. Concurrent catalog edits are
    // retried, and inventory/prices/other book fields are never included in the patch.
    return runTransaction(db, async transaction => {
      const settings = await transaction.get(doc(db, "settings", "website"));
      const live = normalizeCategories(settings.data()?.design?.categories ?? [...CATEGORIES]);
      const liveSource = live.find(c => c.id === source.id);
      const liveTarget = action === "move" ? live.find(c => c.id === target.id) : liveSource;
      if (!liveSource || ((action === "add" || action === "move") && !liveTarget))
        throw new Error("Publish newly added categories before saving their book assignments.");
      const effectiveSource = { ...source, aliases: [...new Set([...(source.aliases || []), liveSource.name, ...(liveSource.aliases || [])])] };
      const snapshots = await Promise.all(unique.map(id => transaction.get(doc(db, "books", id))));
      if (snapshots.some(s => !s.exists())) throw new Error("A selected book was deleted. Reload the catalog and try again.");
      return snapshots.map(snapshot => {
        const book = snapshot.data();
        if (action !== "add" && !directlyAssigned(book, effectiveSource)) return { ...book, id: snapshot.id };
        // Add uses the published name, so Discard Draft cannot orphan the tags.
        const patch = categoryBookPatch(book, action === "add" ? liveSource : effectiveSource, action, liveTarget);
        transaction.update(snapshot.ref, { ...patch, updatedAt: new Date().toISOString() });
        return { ...book, ...patch, id: snapshot.id };
      });
    });
  },

  // Document-ID ordering includes legacy books without createdAt and gives
  // public pagination the same membership as the sitemap, without writes.
  getStorefrontBooks: publicApi.getStorefrontBooks,

  getBooks: async (limitCount = 50, lastVisible = null) => {
    let q = query(collection(db, "books"), orderBy("createdAt", "desc"), limit(limitCount));
    if (lastVisible) {
      q = query(collection(db, "books"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(limitCount));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), _lastDoc: d }));
  },

  // Every book (no paging or createdAt ordering, so records without createdAt are
  // included) — for screens that must see the whole catalog, like shipping profiles.
  getAllBooks: async (opts: { includePrivate?: boolean } = {}) => {
    const snap = await getDocs(collection(db, "books"));
    // Cost prices, shelf codes and other private fields live in books/{id}/private/admin; merged back for the admin.
    const priv = opts.includePrivate === false ? new Map<string, any>() : await readAllPrivateBookFields();
    return snap.docs.map(d => mergeBookPrivate({ id: d.id, ...d.data() }, priv.get(d.id)));
  },

  // The admin's read of one book (drafts included, private fields merged). The shopper read is publicApi.getBook.
  getBook: async (id: string) => {
    const snap = await getDoc(doc(db, "books", id));
    if (!snap.exists()) return null;
    const priv = await getDoc(privateBookRef(id)).then(s => (s.exists() ? s.data() : null)).catch(() => null);
    return mergeBookPrivate({ id: snap.id, ...snap.data() }, priv);
  },

  createBook: async (book: any) => {
    const dataToSave = { ...book };
    delete dataToSave.id;
    delete dataToSave._lastDoc;
    
    const { pub, priv } = splitBookPrivate(dataToSave);
    const docRef = await addDoc(collection(db, "books"), {
      ...pub,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (Object.keys(priv).length) await setDoc(privateBookRef(docRef.id), { ...priv, updatedAt: new Date().toISOString() });
    await adminApi.recordAuditLog("catalog", `Created book: ${dataToSave.title}`);
    return { id: docRef.id, ...dataToSave };
  },

  /**
   * `loaded` = the book as the editor first showed it. When given, stock the owner didn't
   * change keeps its live value (read in the same transaction), so a sale made while the
   * editor was open is never undone by saving (keepLiveStock), and only the fields the owner
   * changed in the editor are written (changedBookFields) — a field changed elsewhere while
   * the editor was open (another tab, the catalog list, an import) keeps its live value.
   */
  // `options.removeMissing`: `book` is the editor's complete form, so a field that was on the loaded book and is
  // gone from the form was removed on purpose and is deleted. Partial writes (bulk edits, CSV import) leave it off.
  updateBook: async (id: string, book: any, loaded?: any, options: { removeMissing?: boolean } = {}) => {
    const docRef = doc(db, "books", id);
    let dataToSave = { ...book };
    delete dataToSave.id;
    delete dataToSave._lastDoc;

    const privRef = privateBookRef(id);
    // Fields the owner took away in the editor are deleted, not left behind (a save only adds or changes keys).
    const removed = loaded && options.removeMissing ? removedBookFields(dataToSave, loaded) : [];
    const removalsFor = (keys: string[]) => {
      const pubRemoved: Record<string, any> = {};
      const privRemoved: Record<string, any> = {};
      for (const key of keys) {
        if ((PRIVATE_BOOK_KEYS as readonly string[]).includes(key)) { privRemoved[key] = deleteField(); pubRemoved[key] = deleteField(); }
        else pubRemoved[key] = deleteField();
      }
      return { pubRemoved, privRemoved };
    };
    let photosBefore: unknown = undefined;
    if (loaded) {
      dataToSave = await runTransaction(db, async tx => {
        const snap = await tx.get(docRef);
        const privSnap = await tx.get(privRef);
        // Matched to the inventory app (Inventory › Inventory app link): its stock is set from there.
        const linkSnap = await tx.get(doc(db, "systemStatus", "inventoryLink"));
        const links = linkSnap.exists() ? (linkSnap.data() as any).links : null;
        if (!snap.exists()) {
          tx.update(docRef, { ...dataToSave, updatedAt: new Date().toISOString() });
          return dataToSave;
        }
        // The live book as the editor saw it: public record with the private document on top.
        const live = mergeBookPrivate(snap.data(), privSnap.exists() ? privSnap.data() : null);
        const changes = lockLinkedStock(changedBookFields(dataToSave, loaded, live), live, links, id);
        photosBefore = live.photos;
        // Copies the server made after the editor opened (functions/imageCopies.js) stay on the photos.
        if ("photos" in changes) changes.photos = keepPhotoCopies(changes.photos, live.photos);
        const updatedAt = new Date().toISOString();
        const { pub, priv } = splitBookPrivate(changes);
        const { pubRemoved, privRemoved } = removalsFor(removed);
        tx.update(docRef, { ...pub, ...scrubPrivateKeys(priv), ...pubRemoved, updatedAt });
        if (Object.keys(priv).length || Object.keys(privRemoved).length) {
          tx.set(privRef, { ...priv, ...privRemoved, updatedAt }, { mergeFields: [...Object.keys(priv), ...Object.keys(privRemoved), "updatedAt"] });
        }
        // What the book is now: the live record with this save's changes on top.
        const now: Record<string, any> = { ...live, ...changes, updatedAt };
        for (const key of removed) delete now[key];
        return now;
      });
    } else {
      const { pub, priv } = splitBookPrivate(dataToSave);
      const updatedAt = new Date().toISOString();
      await updateDoc(docRef, { ...pub, ...scrubPrivateKeys(priv), updatedAt });
      if (Object.keys(priv).length) await setDoc(privRef, { ...priv, updatedAt }, { mergeFields: [...Object.keys(priv), "updatedAt"] });
    }
    await adminApi.recordAuditLog("catalog", `Updated book: ${dataToSave.title}`);
    // Photos taken off the book: their files leave Storage too (unless another book or an order shows them).
    const gone = removedPhotos(photosBefore, dataToSave.photos);
    if (gone.length) void adminApi.removeBookFiles(gone);
    // The pre-order switch or release date changed: paid, unsent pre-orders follow it, whichever screen saved
    // (editor, CSV import). `preorderSync` says how that went so the caller can tell the owner.
    let preorderSync: { updated: number; failed: boolean } | undefined;
    const touched = ["preorder", "publishDate"].some(k => k in book && (!loaded || !sameValue(book[k], loaded[k])));
    if (touched) {
      try { preorderSync = { updated: await adminApi.syncPreorderOrders(id, dataToSave), failed: false }; }
      catch { preorderSync = { updated: 0, failed: true }; }
    }
    return { id, ...dataToSave, ...(preorderSync ? { preorderSync } : {}) };
  },

  /** Books › Shop order: writes only `sortOrder` (+ updatedAt) on the books whose place changed. */
  saveBookOrder: async (writes: { id: string; sortOrder: number }[]) => {
    const updatedAt = new Date().toISOString();
    for (let i = 0; i < writes.length; i += 400) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + 400)) batch.update(doc(db, "books", w.id), { sortOrder: w.sortOrder, updatedAt });
      await batch.commit();
    }
    if (writes.length) await adminApi.recordAuditLog("catalog", `Rearranged the shop order (${writes.length} book${writes.length === 1 ? "" : "s"} moved)`);
  },

  // The publisher changed a book's pre-order switch or Publication date: carry the new release date
  // onto that book's pre-order lines in paid, unsent orders, so their queue, emails and the customer's
  // tracking page follow it. Returns how many orders changed.
  syncPreorderOrders: async (bookId: string, book: any): Promise<number> => {
    const orders = await adminApi.getAllOrders();
    let changed = 0;
    for (const o of orders) {
      const items = restampPreorderItems(o, bookId, book);
      if (!items) continue;
      await updateDoc(doc(db, "orders", o.id), { items, updatedAt: new Date().toISOString() });
      changed++;
    }
    if (changed) await adminApi.recordAuditLog("orders", `Pre-order release date for ${book?.title || bookId} updated on ${changed} order(s).`);
    return changed;
  },

  deleteBook: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, "books", id));
      const title = snap.exists() ? snap.data().title : id;
      await deleteDoc(doc(db, "books", id));
      const photos = snap.exists() ? snap.data().photos : null;
      if (Array.isArray(photos) && photos.length) void adminApi.removeBookFiles(photos);
      // A subcollection document outlives its parent, so the private fields are removed with the book.
      await deleteDoc(privateBookRef(id)).catch(() => {});
      await adminApi.recordAuditLog("catalog", `Deleted book: ${title}`);
    } catch (err) {
      await deleteDoc(doc(db, "books", id));
      await deleteDoc(privateBookRef(id)).catch(() => {});
    }
  },

  /**
   * Deletes the Storage files of photos no longer on a book (see admin/bookFileCleanup.ts). Runs after the
   * save, never blocks it, and leaves any file another book or an order line still shows.
   */
  removeBookFiles: async (gone: unknown[]): Promise<string[]> => {
    try {
      const { getApp } = await import("firebase/app");
      const bucket = String(getApp().options.storageBucket || "");
      const [books, orders] = await Promise.all([adminApi.getAllBooks({ includePrivate: false }), adminApi.getAllOrders()]);
      const paths = unusedBookFiles(gone, shownUrls(books as any[], orders as any[]), bucket);
      const failed = await mediaApi.removeFiles(paths);
      return paths.filter(p => !failed.includes(p));
    } catch (error) {
      console.warn("Could not clean up removed book photos", error);
      return [];
    }
  },

  duplicateBook: async (id: string) => {
    const docRef = doc(db, "books", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Original book not found");
    const privSnap = await getDoc(privateBookRef(id)).catch(() => null);
    const data = mergeBookPrivate(snap.data(), privSnap && privSnap.exists() ? privSnap.data() : null);
    // No ISBN/SKU/slug/stock/featured flag/digital file: the copy must not pose as, or sell, the original.
    const copy = duplicateBookData(data);
    const { pub, priv } = splitBookPrivate(copy);
    const newDoc = await addDoc(collection(db, "books"), pub);
    if (Object.keys(priv).length) await setDoc(privateBookRef(newDoc.id), { ...priv, updatedAt: new Date().toISOString() });
    await adminApi.recordAuditLog("catalog", `Duplicated book: ${data.title}`);
    return { ...copy, id: newDoc.id };
  },

  addPhotos: async (bookId: string, photos: any[]) => {
    const docRef = doc(db, "books", bookId);
    const bookSnap = await getDoc(docRef);
    if (!bookSnap.exists()) throw new Error("Book not found");
    
    const currentPhotos = bookSnap.data().photos || [];
    const newPhotos = [
      ...currentPhotos,
      ...photos.map(p => ({
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        url: p.url ?? p,
        altText: p.altText ?? "",
        createdAt: new Date().toISOString(),
      }))
    ].slice(0, 10);

    await updateDoc(docRef, {
      photos: newPhotos,
      updatedAt: new Date().toISOString(),
    });
    return newPhotos;
  },

  // Uploads
  uploadFile: async (file: File, path: string) => {
    const [{ getStorage, ref, uploadBytes, getDownloadURL }, { getApp }] = await Promise.all([
      import("firebase/storage"),
      import("firebase/app"),
    ]);
    const storageRef = ref(getStorage(getApp()), path);
    // Every public upload path is unique (timestamp/id in the name, never overwritten), so browsers may keep
    // the file for a year instead of Storage's default "private, max-age=0" re-download on every visit.
    const snapshot = await uploadBytes(storageRef, file, { cacheControl: PUBLIC_FILE_CACHE });
    return await getDownloadURL(snapshot.ref);
  },

  // A file for a Storage folder the browser cannot read back (digital-assets/: `read: false`). Returns the
  // Storage path, which is what downloadDigitalAsset opens on the server; getDownloadURL would be refused (#4).
  uploadStoragePath: async (file: File, path: string) => {
    const [{ getStorage, ref, uploadBytes }, { getApp }] = await Promise.all([
      import("firebase/storage"),
      import("firebase/app"),
    ]);
    const snapshot = await uploadBytes(ref(getStorage(getApp()), path), file);
    return snapshot.ref.fullPath || path;
  },

  uploadBrandAsset: async (file: File, type: 'logo' | 'favicon') => {
    const ext = file.name.split('.').pop();
    const path = `assets/brand/${type}_${Date.now()}.${ext}`;
    return adminApi.uploadFile(file, path);
  },

  // Authors
  getAuthors: async () => {
    const snap = await getDocs(collection(db, "authors"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  createAuthor: async (author: any) => {
    const docRef = await addDoc(collection(db, "authors"), {
      ...author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { id: docRef.id, ...author };
  },

  // Shipping Profiles
  getShippingProfiles: publicApi.getShippingProfiles,

  migrateShippingProfiles: async () => {
    try {
      const snap = await getDocs(collection(db, "shipping-profiles"));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      const legacyDocs = docs.filter(d => !d.zones);
      if (legacyDocs.length === 0) {
        return; 
      }

      console.log("Found legacy shipping profiles, starting migration...");

      const zones = legacyDocs.map(d => {
        const rates: any[] = [
          {
            id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
            name: d.serviceName || "Standard Shipping",
            base: Number(d.base) || 0,
            additional: Number(d.additional) || 0,
            deliveryDays: d.deliveryDays || null,
            minPrice: null,
            maxPrice: d.freeThreshold && Number(d.freeThreshold) > 0 ? Number(d.freeThreshold) : null
          }
        ];

        if (d.freeThreshold && Number(d.freeThreshold) > 0) {
          rates.push({
            id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
            name: "Free Shipping",
            base: 0,
            additional: 0,
            deliveryDays: d.deliveryDays || null,
            minPrice: Number(d.freeThreshold),
            maxPrice: null
          });
        }

        // Store ISO codes (what checkout matches on) and flag catch-all regions.
        const restOfWorld = /^(everywhere else|international|rest of world|worldwide)$/i.test(String(d.region || "").trim());
        const code = restOfWorld ? null : toCountryCodes([d.region])[0];

        return {
          id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
          name: d.region,
          region: d.region,
          countries: code ? [code] : [],
          restOfWorld,
          rates
        };
      });

      const generalProfile = {
        name: "General Shipping Profile",
        zones,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const genRef = doc(db, "shipping-profiles", "general-profile");
      await setDoc(genRef, generalProfile);

      const booksSnap = await getDocs(collection(db, "books"));
      const batch = writeBatch(db);
      booksSnap.docs.forEach(b => {
        batch.update(b.ref, {
          shippingProfileId: "general-profile",
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit();

      const deleteBatch = writeBatch(db);
      legacyDocs.forEach(d => {
        if (d.id !== "general-profile") {
          deleteBatch.delete(doc(db, "shipping-profiles", d.id));
        }
      });
      await deleteBatch.commit();

      console.log("Migration completed successfully!");
      await adminApi.recordAuditLog("shipping", "Migrated database to nested shipping profiles and updated books.");
    } catch (err) {
      console.error("Migration failed:", err);
    }
  },

  createShippingProfile: async (profile: any) => {
    const docRef = await addDoc(collection(db, "shipping-profiles"), {
      name: profile.name,
      zones: profile.zones || [],
      // A profile made from a starter or a copy arrives with its rules filled in.
      freeShippingOver: nonNegativeOrNull(profile.freeShippingOver),
      handlingFee: nonNegativeOrNull(profile.handlingFee),
      defaultItemWeightG: nonNegativeOrNull(profile.defaultItemWeightG),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await adminApi.recordAuditLog("shipping", `Created shipping profile: ${profile.name}`);
    return { id: docRef.id, ...profile };
  },

  updateShippingProfile: async (id: string, profile: any) => {
    const docRef = doc(db, "shipping-profiles", id);
    const dataToSave = {
      name: profile.name,
      zones: profile.zones || [],
      // Profile rules (Profile rules card): free-over, packing fee, assumed weight.
      freeShippingOver: nonNegativeOrNull(profile.freeShippingOver),
      handlingFee: nonNegativeOrNull(profile.handlingFee),
      defaultItemWeightG: nonNegativeOrNull(profile.defaultItemWeightG),
      updatedAt: new Date().toISOString()
    };
    await updateDoc(docRef, dataToSave);
    await adminApi.recordAuditLog("shipping", `Updated shipping profile: ${profile.name}`);
    return { id, ...profile };
  },

  deleteShippingProfile: async (id: string) => {
    if (id === "general-profile") {
      throw new Error("Cannot delete the General Shipping Profile.");
    }
    
    const booksSnap = await getDocs(collection(db, "books"));
    const batch = writeBatch(db);
    let count = 0;
    booksSnap.docs.forEach(b => {
      if (b.data().shippingProfileId === id) {
        batch.update(b.ref, { shippingProfileId: "general-profile", updatedAt: new Date().toISOString() });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }

    await deleteDoc(doc(db, "shipping-profiles", id));
    await adminApi.recordAuditLog("shipping", `Deleted shipping profile and returned ${count} books to General Profile.`);
  },

  // Explicit changes only: books in productIds move to this profile; books in
  // removeIds (and only those) go back to General. Books the editor never showed
  // are left alone.
  assignProductsToShippingProfile: async (profileId: string, productIds: string[], removeIds: string[] = []) => {
    const batch = writeBatch(db);
    const booksSnap = await getDocs(collection(db, "books"));
    const add = new Set(productIds);
    const remove = new Set(removeIds);

    booksSnap.docs.forEach(b => {
      const currentProfileId = b.data().shippingProfileId;
      if (add.has(b.id)) {
        if (currentProfileId !== profileId) {
          batch.update(b.ref, { shippingProfileId: profileId, updatedAt: new Date().toISOString() });
        }
      } else if (remove.has(b.id) && currentProfileId === profileId && profileId !== "general-profile") {
        batch.update(b.ref, { shippingProfileId: "general-profile", updatedAt: new Date().toISOString() });
      }
    });

    await batch.commit();
    await adminApi.recordAuditLog("shipping", `Assigned ${productIds.length} books to shipping profile: ${profileId}`);
  },

  // Settings
  // Shopper read of settings/website: no admin-only lookups, never writes, and never keeps the
  // unpublished draft or My themes (older documents may still carry them) in shopper state or cache.
  getPublicSettings: publicApi.getPublicSettings,

  // Alternate templates (Studio 2.8) for the book editor's "Book page template": the live ones, plus ones that so far
  // exist only in the Studio draft (marked unpublished — a book can use one; it shows the default until it's published).
  getAlternateTemplates: async (base: AltBase): Promise<(AlternateTemplate & { published: boolean })[]> => {
    const [live, draft] = await Promise.all([
      publicApi.getPublicSettings().then(s => alternatesFor(s?.design, base)).catch(() => [] as AlternateTemplate[]),
      readDraftField("alternateTemplates").then(v => alternatesFor({ alternateTemplates: v }, base)).catch(() => [] as AlternateTemplate[]),
    ]);
    const out = live.map(t => ({ ...t, name: draft.find(d => d.id === t.id)?.name || t.name, published: true }));
    for (const t of draft) if (!out.some(o => o.id === t.id)) out.push({ ...t, published: false });
    return out;
  },

  // Custom book fields (Studio 2.7): definitions in the public, admin-written settings/bookFields doc.
  getBookFields: async (): Promise<BookFieldDef[]> => {
    const snap = await getDoc(doc(db, "settings", BOOK_FIELDS_DOC));
    return cleanBookFields(snap.exists() ? (snap.data() as any).fields : []);
  },
  saveBookFields: async (fields: BookFieldDef[]): Promise<BookFieldDef[]> => {
    const clean = cleanBookFields(fields);
    await setDoc(doc(db, "settings", BOOK_FIELDS_DOC), { fields: clean, updatedAt: new Date().toISOString() });
    await adminApi.recordAuditLog("catalog", `Updated book fields (${clean.length})`);
    return clean;
  },

  // URL redirects (Settings › General): old address → new address, in the public, admin-written settings/redirects doc.
  getRedirects: publicApi.getRedirects,
  saveRedirects: async (items: Redirect[]): Promise<Redirect[]> => {
    const clean = cleanRedirects(items);
    await setDoc(doc(db, "settings", REDIRECTS_DOC), { items: clean, updatedAt: new Date().toISOString() });
    await adminApi.recordAuditLog("settings", `Updated URL redirects (${clean.length})`);
    return clean;
  },

  getSettings: async () => {
    const docRef = doc(db, "settings", "website");
    const snap = await getDoc(docRef);
    const defaultSettings = adminApi.getDefaultSettings();

    if (!snap.exists()) {
      await setDoc(docRef, defaultSettings);
      return defaultSettings;
    }
    
    // Merge snap data with defaults to ensure new fields are present
    const merged: any = { ...defaultSettings, ...snap.data() };
    // Move any secret keys still sitting in the public doc into adminSecrets, then
    // expose only "stored" flags to the admin UI.
    const raw: any = snap.data() || {};
    if (raw.payments?.stripe?.secretKey || raw.payments?.stripe?.testSecretKey || raw.communications?.resendApiKey) {
      const legacy: any = {};
      if (raw.payments) legacy.payments = raw.payments;
      if (raw.communications) legacy.communications = raw.communications;
      const { publicSettings, secrets } = splitWebsiteSecrets(legacy);
      try {
        await adminApi.writePrivateKeys(secrets);
        await setDoc(docRef, publicSettings, { mergeFields: Object.keys(publicSettings) });
        if (secrets.stripe) await adminApi.markKeysMigrated("stripe").catch(() => {});
        if (secrets.resend) await adminApi.markKeysMigrated("resend").catch(() => {});
        Object.assign(merged, publicSettings);
      } catch (err) {
        console.warn("Could not move secret keys out of public settings:", err);
        // Readiness reports this (a key really is publicly readable right now).
        if (merged.payments?.stripe && (raw.payments?.stripe?.secretKey || raw.payments?.stripe?.testSecretKey)) merged.payments.stripe.publicSecretLeak = true;
      }
    }
    const flags = await adminApi.getPrivateKeyFlags();
    merged.payments = { ...merged.payments, stripe: { ...(merged.payments?.stripe || {}), secretKeyStored: flags.stripeLive, testSecretKeyStored: flags.stripeTest, ...(flags.stripeMigrated ? { keysWerePublic: true } : {}) } };
    merged.payments = { ...merged.payments, paypal: { ...(merged.payments?.paypal || {}), clientSecretStored: flags.paypalLive, testClientSecretStored: flags.paypalTest } };
    merged.communications = { ...merged.communications, resendApiKeyStored: flags.resend };
    // Older designs never chose a themeStyle: render them in Riso Noir (content untouched).
    if (merged.design) merged.design = withRisoNoirDefault(merged.design);
    if (merged.draftDesign) merged.draftDesign = withRisoNoirDefault(merged.draftDesign);
    return merged;
  },

  updateLocalFulfillment: async (config: LocalFulfillmentConfig) => {
    if (auth.currentUser?.email !== "lyricalmyricalbooks@gmail.com" || !auth.currentUser.emailVerified) throw new Error("Unauthorized local fulfillment update.");
    const errors = validateLocalFulfillment(config);
    if (errors.length) throw new Error(errors.join(" "));
    await setDoc(doc(db, "settings", "website"), { localFulfillment: JSON.parse(JSON.stringify(config)) }, { mergeFields: ["localFulfillment"] });
  },

  updateSettings: async (settings: any, options: { publish?: boolean } = {}) => {
    const docRef = doc(db, "settings", "website");
    const { publicSettings, secrets } = splitWebsiteSecrets(settings);
    await adminApi.writePrivateKeys(secrets);
    // `analytics` (the Google Analytics measurement ID and the Microsoft Clarity project ID) is written only by
    // Settings › General › Google Analytics / Microsoft Clarity (googleAnalyticsApi.save, clarityApi.save); a settings
    // form holding an older copy must never put either back.
    const { analytics: _ownedByGaCard, ...ownedHere } = publicSettings as Record<string, any>;
    const { payload, options: writeOptions } = themeWrite(ownedHere, options.publish);
    await setDoc(docRef, payload, writeOptions);
    // The primary write already succeeded. An audit failure must not report a
    // failed publish and encourage a duplicate operation.
    await adminApi.recordAuditLog("settings", `Updated settings: ${Object.keys(settings).join(", ")}`).catch(error => console.warn("Settings saved; audit log unavailable", error));
  },

  // Categories are catalog structure, not a theme draft. Keep the published
  // storefront and Studio working copy in lockstep without replacing either
  // design map (which could otherwise discard unrelated unsaved design work).
  updateShopCategories: async (categories: any[]) => {
    const docRef = doc(db, "settings", "website");
    const snapshot = JSON.parse(JSON.stringify(categories));
    await setDoc(docRef, { design: { categories: snapshot } }, { mergeFields: ["design.categories"] });
    await draftFieldUpdate({ categories: snapshot });
    await adminApi.recordAuditLog("settings", `Updated shop categories (${snapshot.length})`).catch(error => console.warn("Categories saved; audit log unavailable", error));
  },

  // Book editor › Categories & tags › create a category: it goes live straight away AND joins
  // Studio's working copy, appended to each list separately so unpublished draft categories
  // are never published as a side effect.
  addShopCategory: async (category: any) => {
    const docRef = doc(db, "settings", "website");
    const added = JSON.parse(JSON.stringify(category));
    let draftBase: any;
    await runTransaction(db, async tx => {
      const data: any = (await tx.get(docRef)).data() || {};
      const live = appendCategory(data.design?.categories, added, CATEGORIES);
      tx.set(docRef, { design: { categories: live } }, { mergeFields: ["design.categories"] });
      draftBase = data;
    });
    const draft = appendCategory((await readDraftField("categories")) ?? draftBase?.design?.categories, added, CATEGORIES);
    await draftFieldUpdate({ categories: draft });
    await adminApi.recordAuditLog("settings", `Added shop category ${added.name}`).catch(error => console.warn("Category saved; audit log unavailable", error));
  },

  // Flip the storefront "under construction" wall live, keeping the Studio
  // draft in step so the next Publish doesn't silently undo it.
  setUnderConstruction: async (on: boolean) => {
    const docRef = doc(db, "settings", "website");
    await setDoc(docRef, { design: { showUnderConstruction: on } }, { mergeFields: ["design.showUnderConstruction"] });
    await draftFieldUpdate({ showUnderConstruction: on });
    await adminApi.recordAuditLog("settings", `Under construction wall ${on ? "on" : "off"}`).catch(error => console.warn("Saved; audit log unavailable", error));
  },

  // ── Theme version history (persisted so it survives reloads) ──
  THEME_VERSION_LIMIT: 30,

  // Every Publish keeps its own version. Save draft only refreshes one "latest draft"
  // entry, so frequent saving (Ctrl/Cmd+S) can't push published versions out of history.
  THEME_DRAFT_VERSION_ID: "draft-latest",

  saveThemeVersion: async (kind: "draft" | "published", label: string, design: any) => {
    const createdAt = new Date().toISOString();
    const snapshot = JSON.parse(JSON.stringify(design));
    if (kind === "draft") {
      const id = adminApi.THEME_DRAFT_VERSION_ID;
      await setDoc(doc(db, "theme-versions", id), { kind, label, createdAt, design: snapshot });
      return { id, kind, label, createdAt, design: snapshot };
    }
    const ref = await addDoc(collection(db, "theme-versions"), { kind, label, createdAt, design: snapshot });
    // Best-effort pruning of anything past the retention limit (each Publish adds one, so a
    // short ordered page is enough — no need to download every stored design). Pinned versions
    // and checkpoints (Studio › Version history) are never pruned.
    try {
      const snap = await getDocs(query(collection(db, "theme-versions"), orderBy("createdAt", "desc"), limit(adminApi.THEME_VERSION_LIMIT + 10)));
      const stale = snap.docs
        .filter((d: any) => d.id !== adminApi.THEME_DRAFT_VERSION_ID && d.data?.()?.pinned !== true)
        .slice(adminApi.THEME_VERSION_LIMIT);
      await Promise.all(stale.map((d: any) => deleteDoc(doc(db, "theme-versions", d.id))));
    } catch (err) {
      console.warn("Could not prune theme versions:", err);
    }
    return { id: ref.id, kind, label, createdAt, design: snapshot };
  },

  /** Most pinned versions/checkpoints kept at once (they never age out, so they are capped). */
  THEME_PINNED_LIMIT: 20,

  /** Pinned versions, newest first (a single-field filter: no composite index needed). */
  listPinnedThemeVersions: async () => {
    const snap = await getDocs(query(collection(db, "theme-versions"), where("pinned", "==", true)));
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  },

  /** A named, pinned snapshot of the current draft (Studio › Version history › Save checkpoint). */
  saveThemeCheckpoint: async (name: string, design: any) => {
    const clean = String(name || "").trim().slice(0, 80) || `Checkpoint ${new Date().toLocaleString()}`;
    if ((await adminApi.listPinnedThemeVersions()).length >= adminApi.THEME_PINNED_LIMIT) throw new Error("THEME_PINNED_LIMIT");
    const createdAt = new Date().toISOString();
    const snapshot = JSON.parse(JSON.stringify(design));
    const entry = { kind: "checkpoint", label: clean, name: clean, pinned: true, createdAt, design: snapshot };
    const ref = await addDoc(collection(db, "theme-versions"), entry);
    return { id: ref.id, ...entry };
  },

  /** Rename or pin/unpin a kept version. The latest-draft entry is overwritten by every save, so it can't be. */
  updateThemeVersion: async (id: string, patch: { name?: string; pinned?: boolean }) => {
    if (!id || id === adminApi.THEME_DRAFT_VERSION_ID) throw new Error("The latest draft can't be renamed or pinned — keep it as a checkpoint instead.");
    const update: Record<string, any> = {};
    if (typeof patch.name === "string") {
      const clean = patch.name.trim().slice(0, 80);
      if (clean) update.name = clean;
    }
    if (typeof patch.pinned === "boolean") {
      if (patch.pinned) {
        const pinned = await adminApi.listPinnedThemeVersions();
        if (!pinned.some((v: any) => v.id === id) && pinned.length >= adminApi.THEME_PINNED_LIMIT) throw new Error("THEME_PINNED_LIMIT");
      }
      update.pinned = patch.pinned;
    }
    if (Object.keys(update).length) await updateDoc(doc(db, "theme-versions", id), update);
    return update;
  },

  /** Delete a checkpoint or an older published version (never the latest-draft entry). */
  deleteThemeVersion: async (id: string) => {
    if (!id || id === adminApi.THEME_DRAFT_VERSION_ID) throw new Error("The latest draft entry can't be deleted.");
    await deleteDoc(doc(db, "theme-versions", id));
  },

  /** The latest versions plus every pinned one (pinned ones may be older than the latest 30). */
  listThemeVersions: async () => {
    const snap = await getDocs(
      query(collection(db, "theme-versions"), orderBy("createdAt", "desc"), limit(adminApi.THEME_VERSION_LIMIT)),
    );
    const recent = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    let pinned: any[] = [];
    try { pinned = await adminApi.listPinnedThemeVersions(); } catch (err) { console.warn("Could not load pinned theme versions:", err); }
    const seen = new Set(recent.map((v: any) => v.id));
    return [...recent, ...pinned.filter((v: any) => !seen.has(v.id))]
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  },

  /** The design that is live right now (settings/website.design), read fresh. Studio's "published" baseline. */
  getLiveDesign: async () => {
    const snap = await getDoc(doc(db, "settings", "website"));
    return snap.exists() ? ((snap.data() as any)?.design ?? {}) : {};
  },

  /**
   * Every design stored for later use that could put a picture back on the shop: scheduled and running
   * themeSchedule entries (their design and, for a running campaign, the design it will restore) and
   * unexpired share-preview links. Media Delete checks these. Throws when either can't be read.
   */
  listStoredDesigns: async () => {
    const out: { label: string; design: any }[] = [];
    const schedule = await getDocs(collection(db, "themeSchedule"));
    for (const d of schedule.docs as any[]) {
      const data = d.data();
      if (data.status !== "scheduled" && data.status !== "live") continue;
      const name = String(data.name || "Scheduled design");
      out.push({ label: `Scheduled › ${name}`, design: data.design });
      if (data.revertDesign) out.push({ label: `Scheduled › ${name} (the design restored when it ends)`, design: data.revertDesign });
    }
    const links = await getDocs(collection(db, "previewTokens"));
    const now = Date.now();
    for (const d of links.docs as any[]) {
      const data = d.data();
      const expires = typeof data.expiresAt?.toDate === "function" ? data.expiresAt.toDate().getTime() : Date.parse(String(data.expiresAt || ""));
      if (Number.isFinite(expires) && expires <= now) continue;
      out.push({ label: `Share link › ${String(data.name || "Unpublished design")}`, design: data.design });
    }
    return out;
  },

  // ── Share previews (Studio 3.4): previewTokens/{token}, readable by the exact token until it expires ──
  PREVIEW_LINK_MAX_DAYS: 30,

  /** Saves `design` behind a new unguessable token for `days` (1–30) and returns the link's details. */
  createPreviewLink: async (design: any, name: string, days = 7) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const span = Math.min(adminApi.PREVIEW_LINK_MAX_DAYS, Math.max(1, Math.round(days)));
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + span * 86_400_000);
    const clean = String(name || "").trim().slice(0, 80) || "Unpublished design";
    await setDoc(doc(db, "previewTokens", token), {
      design: JSON.parse(JSON.stringify(design ?? {})), name: clean,
      createdAt: Timestamp.fromDate(createdAt), expiresAt: Timestamp.fromDate(expiresAt),
    });
    return { token, name: clean, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
  },

  /** Every preview link (admin only), newest first, without the designs. */
  listPreviewLinks: async () => {
    const snap = await getDocs(collection(db, "previewTokens"));
    const iso = (v: any) => (typeof v?.toDate === "function" ? v.toDate().toISOString() : String(v || ""));
    return snap.docs.map((d: any) => { const data = d.data(); return { token: d.id, name: String(data.name || ""), createdAt: iso(data.createdAt), expiresAt: iso(data.expiresAt) }; })
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Turns a preview link off at once. */
  revokePreviewLink: async (token: string) => {
    if (!token) return;
    await deleteDoc(doc(db, "previewTokens", token));
  },

  // ── Scheduled publishing & campaigns (Studio 3.5): themeSchedule/{id}, run by the Functions scheduler ──
  /** Every schedule entry, newest start first, without their designs. */
  listThemeSchedule: async () => {
    const snap = await getDocs(collection(db, "themeSchedule"));
    return snap.docs.map((d: any) => { const { design: _d, revertDesign: _r, ...rest } = d.data(); return { id: d.id, ...rest }; })
      .sort((a: any, b: any) => String(b.startAt || "").localeCompare(String(a.startAt || "")));
  },
  /**
   * `liveBase` = the live values of the fields changed outside Publish (shop categories, the under-construction wall) when
   * the schedule is made. The scheduler uses it to tell "left as it was" (take the current live value) from "changed on
   * purpose in this design" (keep it): functions/themeSchedule.js.
   */
  addThemeSchedule: async (entry: { kind: "publish" | "campaign"; name: string; startAt: string; endAt?: string | null; design: any; liveBase?: Record<string, any> }) => {
    const clean = { kind: entry.kind, name: String(entry.name || "").trim().slice(0, 80) || "Scheduled design", status: "scheduled",
      startAt: entry.startAt, endAt: entry.kind === "campaign" ? entry.endAt || null : null, createdAt: new Date().toISOString(),
      design: JSON.parse(JSON.stringify(entry.design ?? {})),
      ...(entry.liveBase ? { liveBase: JSON.parse(JSON.stringify(entry.liveBase)) } : {}) };
    const ref = await addDoc(collection(db, "themeSchedule"), clean);
    return { id: ref.id, ...clean };
  },
  /** Cancels an entry that hasn't started. */
  cancelThemeSchedule: async (id: string) => {
    await runTransaction(db, async (tx: any) => {
      const ref = doc(db, "themeSchedule", id);
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().status !== "scheduled") throw new Error("It has already started or finished.");
      tx.update(ref, { status: "cancelled", endedAt: new Date().toISOString() });
    });
  },
  /** Ends a running campaign at the scheduler's next check (within 15 minutes). */
  endCampaignNow: async (id: string) => {
    await updateDoc(doc(db, "themeSchedule", id), { endAt: new Date().toISOString() });
  },
  /** When the Functions scheduler last ran (themes/scheduler.lastRunAt). */
  getSchedulerStatus: async () => {
    const snap = await getDoc(doc(db, "themes", "scheduler"));
    return snap.exists() ? (snap.data() as any) : null;
  },

  getDefaultSettings: defaultSettings,

  // Audit Log
  getAuditLog: (limitCount = 100) => auditLog.list(limitCount),

  // ORDERS
  // Every order, newest first, read in pages so nothing is cut off at a fixed count.
  getAllOrders: async () => {
    const orders: any[] = [];
    let cursor: any = null;
    while (true) {
      const page = await adminApi.getOrders(200, cursor);
      orders.push(...page);
      if (page.length < 200) break;
      cursor = page[page.length - 1]._lastDoc;
    }
    return orders;
  },

  getFulfillmentOrders: async () => {
    const orders = await adminApi.getAllOrders();
    const operations = await getDocs(collection(db, "order-operations"));
    const byId = new Map(operations.docs.map(d => [d.id, d.data()]));
    return orders.map(o => ({ ...o, operations: byId.get(o.id) || {} }));
  },

  // The newest orders only (with their private records), for the Orders desk's minute-by-minute refresh.
  // Reads about 2 x `pageSize` documents instead of the whole collection; merge with `mergeNewestPage`.
  getRecentFulfillmentOrders: async (pageSize = 100) => {
    const orders = await adminApi.getOrders(pageSize);
    const ids = orders.map((o: any) => o.id);
    const byId = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await getDocs(query(collection(db, "order-operations"), where(documentId(), "in", ids.slice(i, i + 30))));
      snap.docs.forEach((d) => byId.set(d.id, d.data()));
    }
    return orders.map((o: any) => ({ ...o, operations: byId.get(o.id) || {} }));
  },

  correctOrderAddress: async (id: string, address: any, originalKey: string) => {
    await runTransaction(db, async tx => {
      const ref = doc(db, "orders", id);
      const privateRef = doc(db, "order-operations", id);
      const snap = await tx.get(ref);
      const privateSnap = await tx.get(privateRef);
      if (!snap.exists()) throw new Error("Order no longer exists.");
      const o: any = snap.data();
      const method = o.fulfillmentSelection?.method;
      if (method === "pickup") throw new Error("Pickup orders use the selected store address and do not have a customer shipping address to change.");
      if (o.status === "completed" || o.status === "cancelled" || o.paymentStatus !== "paid" || o.isTest || o.labelUrl || ["shipped", "out_for_delivery", "delivered"].includes(o.fulfillmentStatus)) throw new Error("Address changes are unavailable after label purchase or dispatch.");
      if (addressKey(o) !== originalKey) throw new Error("The address changed. Reload the order first.");
      const cleaned = Object.fromEntries(["street", "unit", "city", "state", "zip", "country"].map(k => [k, String(address[k] || "").trim().slice(0, 200)]));
      const oldAddress = o.customer?.address || {};
      if (method === "local_delivery" && ["state", "zip", "country"].some(key => String(cleaned[key] || "").trim().toLowerCase() !== String(oldAddress[key] || "").trim().toLowerCase())) throw new Error("For a paid local delivery, province, postal code and country cannot change. Cancel and refund this order, then place a new order for the new area.");
      // Shipping and sales tax were charged for the original country/province.
      if (method !== "local_delivery" && ["state", "country"].some(key => String(cleaned[key] || "").trim().toLowerCase() !== String(oldAddress[key] || "").trim().toLowerCase())) throw new Error("Shipping and tax were charged for the original country and province, so those can't change on a paid order. Fix the street, city or postal code, or refund this order and have the customer order again.");
      const problems = addressIssues({ customer: { address: cleaned } });
      if (problems.length) throw new Error(problems.join(" "));
      const now = new Date().toISOString();
      tx.update(ref, { "customer.address": cleaned, addressVerified: deleteField(), addressError: deleteField(), updatedAt: now });
      const data = privateSnap.data() || {};
      if (data.labelPurchasePending) throw new Error("Wait for label purchase reconciliation before correcting the address.");
      // The publisher just typed and checked this address, so it counts as reviewed.
      tx.set(privateRef, { ...data, addressReviewed: addressKey({ customer: { address: cleaned } }), updatedAt: now, activity: [...(data.activity || []), { type: "event", message: "Shipping address corrected and confirmed by publisher.", createdAt: now }] });
    });
  },

  fulfillmentAction: async (id: string, action: "review" | "pack" | "hold" | "release" | "release_preorder" | "dispatch" | "local_transition" | "edit_tracking" | "delivery_status" | "resend_shipping_email" | "resend_confirmation_email" | "clear_app_label", payload: any = {}) => {
    await runTransaction(db, async tx => {
      const ref = doc(db, "orders", id);
      const privateRef = doc(db, "order-operations", id);
      const snap = await tx.get(ref);
      const privateSnap = await tx.get(privateRef);
      if (!snap.exists()) throw new Error("Order no longer exists.");
      const operations: any = privateSnap.data() || {};
      const o: any = { ...snap.data(), operations };
      const now = new Date().toISOString();
      if (o.paymentStatus !== "paid" || o.status === "cancelled" || o.isTest === true || ["cancelled", "refunded"].includes(o.fulfillmentStatus)) throw new Error("Only active paid production orders can be prepared.");
      let message = "";
      if (action === "review") {
        if (queueOf(o) === "In transit" || queueOf(o) === "Completed") throw new Error("This order has already been dispatched.");
        if (addressIssues(o).length) throw new Error(addressIssues(o).join(" "));
        if (payload.addressKey !== addressKey(o)) throw new Error("The address changed. Reload and review it again.");
        operations.addressReviewed = addressKey(o); message = "Shipping address reviewed by publisher.";
      } else if (action === "pack") {
        if (queueOf(o) !== "Ready to pack") throw new Error("Review the address and release any hold before packing.");
        if (payload.packingKey !== packingKey(o)) throw new Error("Items changed. Reload the checklist.");
        operations.packed = packingKey(o); operations.packedAt = now; message = "All items packed and checked.";
        tx.update(ref, { fulfillmentStatus: "processing", updatedAt: now });
      } else if (action === "hold") {
        if (!["Needs attention", "Ready to pack", "Ready to ship"].includes(queueOf(o))) throw new Error("Only undispatched orders can be held.");
        if (!String(payload.reason || "").trim()) throw new Error("Enter a hold reason.");
        operations.hold = String(payload.reason).trim().slice(0, 500); message = `Order held: ${operations.hold}`;
      } else if (action === "release") { operations.hold = ""; message = "Fulfillment hold released.";
      } else if (action === "release_preorder") {
        // The pre-ordered books arrived before their release date: let this order be packed now.
        if (queueOf(o) !== "Awaiting release") throw new Error("This order is not waiting for a pre-order release.");
        operations.preorderReleased = true; operations.preorderReleasedAt = now;
        // Public too, so the customer's tracking page stops promising the later date.
        tx.update(ref, { preorderReleasedAt: now, updatedAt: now });
        message = "Pre-order released early by publisher: ready to pack and ship.";
      } else if (action === "dispatch") {
        const problem = dispatchProblem(o); if (problem) throw new Error(problem);
        const tracking = trackingFields(payload);
        tx.update(ref, { status: "completed", fulfillmentStatus: "shipped", ...tracking, shippedAt: now, updatedAt: now });
        message = `Dispatched via ${tracking.trackingCarrier}. Tracking: ${tracking.trackingNumber}`;
      } else if (action === "clear_app_label") {
        // A label bought in the inventory app (Inventory app link) that won't be used: take its tracking off
        // the order so the website can buy its own. Only before the parcel left.
        if (o.trackingSource !== "inventory-app" || o.labelUrl) throw new Error("This order has no inventory app label to remove.");
        if (queueOf(o) === "In transit" || queueOf(o) === "Completed") throw new Error("This order has already been dispatched.");
        tx.update(ref, { trackingNumber: deleteField(), trackingCarrier: deleteField(), trackingUrl: deleteField(), trackingSource: deleteField(), updatedAt: now });
        operations.labelHistory = [...(operations.labelHistory || []), { trackingNumber: o.trackingNumber || null, trackingCarrier: o.trackingCarrier || null, replacedAt: now, replacedBy: "admin (inventory app label removed)" }];
        operations.externalLabel = null;
        message = `Inventory app label ${o.trackingNumber || ""} removed from the order. Void or reuse it in the inventory app.`;
      } else if (action === "edit_tracking") {
        if (fulfillmentMethod(o) !== "shipping" || queueOf(o) !== "In transit") throw new Error("Tracking can only be corrected while the parcel is in transit.");
        if (o.labelUrl && payload.replaceLabel === true) {
          // The label was voided or replaced: record the real carrier and number (the Shippo webhook finds the
          // order by number) and keep the old label in the private history.
          const tracking = trackingFields(payload);
          tx.update(ref, { ...tracking, labelUrl: deleteField(), updatedAt: now });
          operations.labelHistory = [...(operations.labelHistory || []), { trackingNumber: o.trackingNumber || null, trackingCarrier: o.trackingCarrier || null, labelUrl: o.labelUrl, replacedAt: now, replacedBy: "admin" }];
          message = `Label #${o.trackingNumber || ""} replaced: tracking is now ${tracking.trackingCarrier} · ${tracking.trackingNumber}`;
        } else if (o.labelUrl) {
          // Shippo owns the carrier and number (its webhook finds the order by number); only the link may change.
          const { trackingUrl } = trackingFields({ trackingCarrier: o.trackingCarrier || "Carrier", trackingNumber: o.trackingNumber || "-", trackingUrl: payload.trackingUrl });
          tx.update(ref, { trackingUrl, updatedAt: now });
          message = trackingUrl ? `Tracking link set: ${trackingUrl}` : "Tracking link cleared (carrier's page is used).";
        } else {
          const tracking = trackingFields(payload);
          tx.update(ref, { ...tracking, updatedAt: now });
          message = `Tracking corrected: ${tracking.trackingCarrier} · ${tracking.trackingNumber}`;
        }
      } else if (action === "resend_shipping_email") {
        if (fulfillmentMethod(o) !== "shipping" || queueOf(o) !== "In transit" || o.fulfillmentStatus === "delivered") throw new Error("The shipping email can only be resent while the parcel is in transit.");
        if (!String(o.trackingNumber || "").trim()) throw new Error("Add tracking before resending the shipping email.");
        tx.update(ref, { shippingEmailRequestedAt: now, updatedAt: now });
        message = `Shipping email resent to ${o.customer?.email || "the customer"}.`;
      } else if (action === "resend_confirmation_email") {
        // The server's onOrderUpdated sends the customer's Order confirmed email once per stamp.
        tx.update(ref, { confirmationEmailRequestedAt: now, updatedAt: now });
        message = `Order confirmation resent to ${o.customer?.email || "the customer"}.`;
      } else if (action === "delivery_status") {
        if (fulfillmentMethod(o) !== "shipping" || queueOf(o) !== "In transit") throw new Error("Only shipped parcels in transit can be updated.");
        const next = String(payload.status || "");
        if (!["out_for_delivery", "delivered"].includes(next) || next === o.fulfillmentStatus) throw new Error("Choose a new delivery status.");
        tx.update(ref, { fulfillmentStatus: next, ...(next === "delivered" ? { deliveredAt: now } : { outForDeliveryAt: now }), updatedAt: now });
        message = next === "delivered" ? "Marked delivered by publisher." : "Marked out for delivery by publisher.";
      } else if (action === "local_transition") {
        if (o.customerRequest?.type === "return" && o.customerRequest.status === "open") throw new Error("Resolve the active return before continuing fulfillment.");
        const method = o.fulfillmentSelection?.method;
        if (!['pickup', 'local_delivery'].includes(method)) throw new Error("Only local orders can use this workflow.");
        const current = String(o.fulfillmentStatus || "");
        if (current !== String(payload.expectedStatus || "")) throw new Error("This order changed. Reload before continuing.");
        if (operations.hold) throw new Error("Release the fulfillment hold before continuing.");
        if (queueOf(o) === "Awaiting release") throw new Error("This pre-order hasn't been released yet. Press \"Ready to ship now\" if the books have arrived.");
        // Books already on their way may still be marked delivered (proof for the dispute).
        if (disputeOpen(o) && current !== "out_for_delivery") throw new Error("This payment is disputed. Don't hand over the books until the dispute is settled in Stripe.");
        if (operations.packed !== packingKey(o)) throw new Error("Complete the packing checklist first.");
        if (method === "local_delivery" && (addressIssues(o).length || operations.addressReviewed !== addressKey(o))) throw new Error("Review and confirm the delivery address first.");
        const next = method === "pickup"
          ? ({ "": "ready_for_pickup", processing: "ready_for_pickup", ready_for_pickup: "collected" } as Record<string, string>)[current]
          : ({ "": "ready_for_delivery", processing: "ready_for_delivery", ready_for_delivery: "out_for_delivery", out_for_delivery: "delivered" } as Record<string, string>)[current];
        if (!next) throw new Error("This local order has already reached its final handoff state.");
        const final = ["collected", "delivered"].includes(next);
        const timestamps = next === "ready_for_pickup" ? { readyForPickupAt: now }
          : next === "collected" ? { collectedAt: now }
          : next === "ready_for_delivery" ? { readyForDeliveryAt: now }
          : next === "out_for_delivery" ? { outForDeliveryAt: now }
          : { deliveredAt: now };
        tx.update(ref, { fulfillmentStatus: next, ...(final ? { status: "completed" } : {}), ...timestamps, updatedAt: now });
        message = `Local fulfillment advanced to ${next}.`;
      }
      tx.set(privateRef, { ...operations, updatedAt: now, activity: [...(operations.activity || []), { type: "event", message, createdAt: now }] });
    });
  },

  getOrders: async (limitCount = 50, lastVisible = null) => {
    let q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(limitCount));
    if (lastVisible) {
      q = query(collection(db, "orders"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(limitCount));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), _lastDoc: d }));
  },

  deleteTestOrders: async (orderIds: string[]) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to delete test orders.");
    const response = await functionFetch("deleteTestOrders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ orderIds }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to delete test orders.");
    return result;
  },

  // Owner-initiated removal of unpaid, cancelled and test orders only (deleteRefusal,
  // mirrored by the orders delete rule). This only removes records: it does not refund, restock or touch Stripe.
  deleteOrders: async (orderIds: string[]) => {
    let deleted = 0;
    const failed: string[] = [];
    // Paid, refunded and shipped orders are never deleted (deleteRefusal; also firestore.rules).
    const refused: Array<{ id: string; reason: string }> = [];
    for (const id of orderIds) {
      try {
        const snap = await getDoc(doc(db, "orders", id));
        const label = snap.exists() ? (snap.data().orderId || id) : id;
        const reason = snap.exists() ? deleteRefusal(snap.data()) : "";
        if (reason) { refused.push({ id, reason }); continue; }
        await deleteDoc(doc(db, "orders", id));
        try { await deleteDoc(doc(db, "order-operations", id)); } catch { /* none to remove */ }
        deleted += 1;
        try { await adminApi.recordAuditLog("orders", `Deleted order: ${label}`); } catch { /* best effort */ }
      } catch {
        failed.push(id);
      }
    }
    return { deleted, failed, refused };
  },

  // Archive keeps the order (and its payment/stock history) but takes it out of the work queues.
  archiveOrders: async (orderIds: string[], archived = true) => {
    let changed = 0;
    const failed: string[] = [];
    for (const id of orderIds) {
      try {
        await updateDoc(doc(db, "orders", id), archived ? { archivedAt: new Date().toISOString() } : { archivedAt: deleteField() });
        changed += 1;
      } catch { failed.push(id); }
    }
    if (changed) { try { await adminApi.recordAuditLog("orders", `${archived ? "Archived" : "Restored"} ${changed} order${changed === 1 ? "" : "s"}`); } catch { /* best effort */ } }
    return { changed, failed };
  },

  registerStripePaymentDomain: async (origin: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "registerPaymentDomain", origin }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Couldn't register the domain with Stripe.");
    return result as { domain: string; applePay: string; googlePay: string };
  },

  // Deletes a stored PayPal client secret (admin-only adminSecrets/paypal). Live then falls back to the Functions secret.
  removePaypalSecret: async (mode: "live" | "test") => {
    await setDoc(doc(db, "adminSecrets", "paypal"), { [mode === "live" ? "clientSecret" : "testClientSecret"]: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    await adminApi.recordAuditLog("payments", `Removed the stored PayPal ${mode} client secret`);
  },

  // Deletes the stored Resend key (admin-only adminSecrets/resend); email then uses the RESEND_API_KEY Functions secret.
  removeResendKey: async () => {
    await setDoc(doc(db, "adminSecrets", "resend"), { apiKey: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    await adminApi.recordAuditLog("notifications", "Removed the stored Resend API key");
  },

  // Deletes a stored Stripe secret key (admin-only adminSecrets/stripe). Live then
  // falls back to the Firebase Functions secret, if one is set.
  removeStripeSecretKey: async (mode: "live" | "test") => {
    await setDoc(doc(db, "adminSecrets", "stripe"), { [mode === "live" ? "secretKey" : "testSecretKey"]: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    await adminApi.recordAuditLog("payments", `Removed the stored Stripe ${mode} secret key`);
  },

  // Checks (fix/recreate: repairs) the Stripe webhook endpoint for the mode in use.
  stripeWebhookHealth: async (opts: { fix?: boolean; recreate?: boolean } = {}) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "webhookHealth", ...opts }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Couldn't check the Stripe webhook.");
    return result as {
      mode: "test" | "live"; url: string; found: boolean; enabled: boolean; wrongUrl: boolean;
      missingEvents: string[]; savedSecret: boolean; deployedSecret?: boolean; lastReceivedAt: string | null; lastEventType: string | null;
      lastFailureAt: string | null; lastFailure: string | null; lastProcessingFailureAt?: string | null; lastProcessingFailure?: string | null;
      actions: string[];
    };
  },

  // Customer privacy requests (Settings › General › Privacy requests), newest first.
  listPrivacyRequests: async () => {
    const snap = await getDocs(query(collection(db, "privacyRequests"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  },
  closePrivacyRequest: async (id: string) => {
    await updateDoc(doc(db, "privacyRequests", id), { status: "closed", handledAt: new Date().toISOString() });
  },
  // Server-side export (JSON of everything held about the email) or erase (deletes marketing,
  // cart, alert, contact and account data; keeps orders for tax records).
  privacyAction: async (action: "privacyExport" | "privacyErase", email: string, requestId?: string, options: { reviewAction?: "anonymize" | "unpublish" | "remove-text" } = {}) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action, email, requestId, ...(action === "privacyErase" && options.reviewAction ? { reviewAction: options.reviewAction } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The privacy action failed.");
    if (action === "privacyErase") await adminApi.recordAuditLog("privacy", `Erased personal data for ${email}`);
    return result;
  },

  // "Test connection": asks Stripe whether each saved secret key works and which account/mode it is.
  // Cancels an unpaid order on the server: refused if it was paid meanwhile; stops the
  // Stripe payment the shopper may still be completing.
  cancelUnpaidOrder: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "cancelOrder", orderId } satisfies OrderActionBody & { action: string }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't cancel the order.");
    return result as { cancelled: boolean; stopped: string[] };
  },

  // The late or mismatched payment on this order has been refunded in Stripe/PayPal.
  resolvePaymentMismatch: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "resolvePaymentMismatch", orderId } satisfies OrderActionBody & { action: string }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't update the order.");
    return result;
  },

  restockRefundedOrder: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "restockRefunded", orderId } satisfies OrderActionBody & { action: string }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't put the books back in stock.");
    return result;
  },

  verifyStripeKeys: async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "verifyStripeKeys" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Couldn't reach Stripe.");
    type ModeResult = { source: "stored" | "functions" | "none"; publishableKeyMode: "live" | "test" | "invalid" | "missing"; keyMode?: string; ok?: boolean; accountId?: string | null; accountName?: string | null; chargesEnabled?: boolean; error?: string };
    return result as { activeMode: "live" | "test"; live: ModeResult; test: ModeResult; sameAccount: boolean | null };
  },

  // Asks Stripe (server-side) whether an unpaid order's payment went through, and
  // reports discrepancies; only the verified Stripe webhook completes payment.
  recheckStripePayment: async (orderId: string) => {
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: await orderAccessHeaders(orderId),
      body: JSON.stringify({ action: "status", orderId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't reach Stripe.");
    return result as { status: string; paymentStatus: string };
  },

  // Last Stripe webhook received / rejected (written by stripeWebhook; admin-only doc).
  // `strict` lets the caller see a failed read (the alert refresh must not mistake it for "no problem").
  getStripeWebhookStatus: async (opts: { strict?: boolean } = {}) => {
    try {
      const snap = await getDoc(doc(db, "adminSecrets", "stripeWebhookStatus"));
      return snap.exists() ? (snap.data() as any) : null;
    } catch (err) { if (opts.strict) throw err; return null; }
  },
  // The nightly backup's last result (null = never recorded; a failed read throws).
  getBackupStatus: async (): Promise<any | null> => {
    const snap = await getDoc(doc(db, "systemStatus", "backup"));
    return snap.exists() ? snap.data() : null;
  },

  // Guest order lookup (thank-you page, /track) lives in publicApi so those pages never load this file.
  getPublicOrder: publicApi.getPublicOrder,

  // Admin only: the order plus its private fulfillment record.
  getOrderById: async (id: string): Promise<(Record<string, any> & { id: string; operations: Record<string, any> }) | null> => {
    const docRef = doc(db, "orders", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const operations = await getDoc(doc(db, "order-operations", id));
    return { id: snap.id, ...snap.data(), operations: operations.data() || {} };
  },

  createOrder: async (order: any) => {
    // Random typeable ID, e.g. FRQZ-047691-K2XP. The extra segment makes IDs
    // hard to enumerate since a known ID grants read access for tracking.
    const prefix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const extra = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderId = `${prefix}-${suffix}-${extra}`;
    const trackingKey = newOrderAccessKey();

    // Orders default to UNPAID; only a verified payment-provider capture
    // handled by Cloud Functions flips them to paid and records revenue.
    // Firestore rules reject non-admin attempts to create any other state.
    await setDoc(doc(db, "orders", orderId), {
      ...order,
      orderId, // Display ID
      trackingKey,
      status: order.status || "pending_payment",
      paymentStatus: order.paymentStatus || "unpaid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [
        { type: "event", message: "Order created", createdAt: new Date().toISOString() }
      ]
    });

    rememberOrderAccess(orderId, trackingKey);
    return orderId;
  },

  updateOrder: async (id: string, data: any) => {
    const docRef = doc(db, "orders", id);
    const dataToSave = { ...data };
    delete dataToSave.id;
    delete dataToSave._lastDoc;

    await updateDoc(docRef, {
      ...dataToSave,
      updatedAt: new Date().toISOString()
    });
  },

  addOrderNote: async (id: string, message: string) => {
    await runTransaction(db, async tx => {
      const ref = doc(db, "order-operations", id);
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      tx.set(ref, { ...data, activity: [...(data.activity || []), { type: "note", message: message.trim().slice(0, 2000), createdAt: new Date().toISOString() }] });
    });
  },

  addOrderEvent: async (id: string, message: string) => {
    await runTransaction(db, async tx => {
      const ref = doc(db, "order-operations", id);
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      tx.set(ref, { ...data, activity: [...(data.activity || []), { type: "event", message, createdAt: new Date().toISOString() }] });
    });
  },

  manageReturn: async (orderId: string, action: string, details: any = {}) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in as admin to manage a return.");
    const response = await functionFetch("manageReturn", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId, action, ...details }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not update return.");
    return body;
  },

  /** Admin-only delivery log rows for one order (sent / failed / queued, with the reason), newest first. */
  getOrderEmailLog: async (orderId: string) => {
    const snap = await getDocs(query(collection(db, "emailLog"), where("orderId", "==", orderId), limit(50)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => String(b.at || "").localeCompare(String(a.at || "")));
  },

  // Parcel presets (box sizes) for the label dialog. Not secret, so a settings doc is fine.
  getParcelPresets: async (): Promise<any[] | null> => {
    const snap = await getDoc(doc(db, "settings", "parcelPresets"));
    return snap.exists() && Array.isArray((snap.data() as any).presets) ? (snap.data() as any).presets : null;
  },
  saveParcelPresets: async (presets: any[]) => {
    await setDoc(doc(db, "settings", "parcelPresets"), { presets, updatedAt: new Date().toISOString() });
  },

  refundOrder: async (orderId: string, options?: { reason?: string; restock?: boolean; amountMinor?: number | null; restockLines?: { index: number; quantity: number }[] }) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to refund an order.");

    const response = await functionFetch("refundOrder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId,
        reason: options?.reason || "Admin refund",
        restock: options?.restock !== false,
        ...(options?.amountMinor != null ? { amountMinor: options.amountMinor } : {}),
        ...(options?.restockLines ? { restockLines: options.restockLines } : {}),
      } satisfies RefundOrderBody),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Refund failed.");
    return result;
  },

  getShippoConfig: async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to view Shippo settings.");

    const response = await functionFetch("getShippoConfig", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to load Shippo settings.");
    return result;
  },

  saveShippoConfig: async (apiToken: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to save Shippo settings.");

    const response = await functionFetch("saveShippoConfig", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ apiToken }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to save Shippo settings.");
    return result;
  },

  setShippoDynamicRates: async (enabled: boolean, countries?: string[], extra?: { enabled: boolean; amount: number }) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to save Shippo settings.");

    const response = await functionFetch("setShippoDynamicRates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ enabled, ...(countries ? { countries } : {}), ...(extra ? { extra } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to update Shippo dynamic rates setting.");
    return result;
  },


  createShippingLabel: async (orderId: string, parcel?: any) => {
    // Endpoint is admin-only on the backend; it verifies this ID token.
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to generate labels.");

    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ orderId, parcel }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to generate shipping label.");
    }
    return await response.json();
  },

  // Secret API keys live only in the admin-only adminSecrets collection.
  writePrivateKeys: async (secrets: SecretPatch) => {
    // The server prefers this stored key over its own, so a wrong one would silently stop the backup sender.
    const resendProblem = secrets.resend ? resendKeyProblem(secrets.resend.apiKey || "") : "";
    if (resendProblem) throw new Error(resendProblem);
    if (secrets.stripe) await setDoc(doc(db, "adminSecrets", "stripe"), { ...secrets.stripe, updatedAt: serverTimestamp() }, { merge: true });
    if (secrets.resend) await setDoc(doc(db, "adminSecrets", "resend"), { ...secrets.resend, updatedAt: serverTimestamp() }, { merge: true });
    if (secrets.paypal) await setDoc(doc(db, "adminSecrets", "paypal"), { ...secrets.paypal, updatedAt: serverTimestamp() }, { merge: true });
  },

  // Settings › General › Tools & records › Shop errors (functions/clientErrors.js writes them; one row per distinct error).
  getClientErrors: async (count = 50) => {
    const snap = await getDocs(query(collection(db, "clientErrors"), orderBy("lastSeenAt", "desc"), limit(count)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },
  clearClientErrors: async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, "clientErrors", id)));
      await batch.commit();
    }
  },

  getRecentEmailLog: async (count = 5) => {
    const snap = await getDocs(query(collection(db, "emailLog"), orderBy("at", "desc"), limit(count)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  getPrivateKeyFlags: async () => {
    const read = async (id: string) => { try { const s = await getDoc(doc(db, "adminSecrets", id)); return s.exists() ? s.data() as any : {}; } catch { return {}; } };
    const [stripe, resend, paypal] = await Promise.all([read("stripe"), read("resend"), read("paypal")]);
    return {
      stripeLive: !!stripe.secretKey, stripeTest: !!stripe.testSecretKey, resend: !!resend.apiKey,
      paypalLive: !!paypal.clientSecret, paypalTest: !!paypal.testClientSecret,
      // Set when a key was found in the public settings and moved here: only then is "rotate it" advice shown.
      stripeMigrated: stripe.migratedFromPublic === true, resendMigrated: resend.migratedFromPublic === true,
    };
  },

  /** Records that a secret was found in public settings and moved to adminSecrets (Settings › Payments / Notifications warn to rotate it). */
  markKeysMigrated: async (kind: "stripe" | "resend") => {
    await setDoc(doc(db, "adminSecrets", kind), { migratedFromPublic: true, migratedAt: serverTimestamp() }, { merge: true });
  },

  /** Save settings/notifications with the Resend key moved to adminSecrets. */
  saveNotificationSettings: async (data: Record<string, any>) => {
    const { publicData, secrets } = splitNotificationSecrets(data);
    await adminApi.writePrivateKeys(secrets);
    await setDoc(doc(db, "settings", "notifications"), publicData);
    return publicData;
  },

  // Which customer emails are switched on (Settings › Notifications); used for dispatch previews.
  getNotificationSettings: async () => {
    const snap = await getDoc(doc(db, "settings", "notifications"));
    return (snap.exists() ? snap.data() : {}) as Record<string, any>;
  },

  getCanadaPostLabelRates: async (orderId: string, parcel?: any) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to view label rates.");
    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ orderId, mode: "rates", parcel }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to load Canada Post rates.");
    return result;
  },

  // Void a bought label that has not left the shop (Shippo refunds it) so a new one can be bought.
  voidLabel: async (orderId: string, confirmedElsewhere = false) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ orderId, mode: "voidLabel", confirmedElsewhere }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't void the label.");
    return result;
  },

  // After an uncertain label purchase the order stays locked; once the owner has checked
  // Shippo (no label bought, or it was voided there) this lets a new label be bought.
  clearLabelPurchaseLock: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ orderId, mode: "clearPurchaseLock" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Couldn't allow a new label.");
    return result;
  },

  buyCanadaPostLabel: async (orderId: string, shipmentId: string, rateId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to buy labels.");
    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ orderId, mode: "purchase", shipmentId, rateId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to buy the Canada Post label.");
    return result;
  },

  markOrderPaid: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("markOrderPaid", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ orderId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to mark order as paid.");
    return result;
  },

  // Pushes the order to the Shippo dashboard (pre-filled) and returns the
  // Shippo site URL to open so the admin can buy the label directly on Shippo.
  // Handled by the createShippingLabel endpoint via mode: "shippoOrder" so no
  // new Cloud Function deployment (and its extra IAM permission) is required.
  createShippoOrder: async (orderId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin to push orders to Shippo.");

    const response = await functionFetch("createShippingLabel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ orderId, mode: "shippoOrder" }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to push order to Shippo.");
    }
    return await response.json();
  },

  // DISCOUNTS ─────────────────────────────────────────────────────────────────
  getDiscounts: async () => {
    const snap = await getDocs(collection(db, "discounts"));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  saveDiscount: async (discount: any) => {
    const now = new Date().toISOString();
    const payload: DiscountRecord = {
      code: discount.method === "automatic" ? "" : (discount.code || "").toUpperCase(),
      type: discount.type || "percentage",
      value: discount.value ?? 0,
      isActive: discount.isActive ?? true,
      startDate: discount.startDate || null,
      expiryDate: discount.expiryDate || null,
      minOrderAmount: discount.minOrderAmount ?? null,
      minQuantity: discount.minQuantity ?? null,
      maxDiscountAmount: discount.maxDiscountAmount ?? null,
      usageLimit: discount.usageLimit ?? null,
      usageCount: discount.usageCount ?? 0,
      onePerCustomer: discount.onePerCustomer ?? false,
      appliesTo: discount.appliesTo || "all",
      selectedCategories: discount.selectedCategories ?? [],
      selectedProducts: discount.selectedProducts ?? [],
      allowedEmailDomains: discount.allowedEmailDomains ?? "",
      allowedCustomerEmails: discount.allowedCustomerEmails ?? "",
      description: discount.description || "",
      buyQuantity: discount.buyQuantity ?? null,
      getQuantity: discount.getQuantity ?? null,
      getDiscountValue: discount.getDiscountValue ?? null,
      tiers: discount.tiers ?? null,
      // Automatic offers have no code (never redeemable by typing one) and a title shoppers see.
      method: discount.method === "automatic" ? "automatic" : "code",
      title: discount.method === "automatic" ? String(discount.title || "").trim() : "",
      giftBookId: discount.type === "gift" ? discount.giftBookId || null : null,
      giftVariantId: discount.type === "gift" ? discount.giftVariantId || null : null,
      createdAt: now,
      updatedAt: now,
    };
    assertDiscountShape(check(discountRecord, payload));
    const docRef = await addDoc(collection(db, "discounts"), payload);
    await adminApi.recordAuditLog("campaigns", `Created campaign: ${payload.code || payload.title || "automatic offer"}`);
    return { id: docRef.id, ...payload };
  },

  updateDiscount: async (id: string, data: any) => {
    const now = new Date().toISOString();
    const payload = { ...data, updatedAt: now };
    delete payload.id;
    delete payload._lastDoc;
    // Redemptions are counted by the server (stripeWebhook / refunds). Writing back the count
    // the editor loaded earlier would undo uses made since and let a capped code run over.
    delete payload.usageCount;
    delete payload.createdAt;
    assertDiscountShape(check(discountUpdate, payload));
    await updateDoc(doc(db, "discounts", id), payload);
    await adminApi.recordAuditLog("campaigns", `Updated campaign: ${payload.code || payload.title || id}`);
    return { id, ...payload };
  },

  deleteDiscount: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, "discounts", id));
      const code = snap.exists() ? snap.data().code : id;
      await deleteDoc(doc(db, "discounts", id));
      await adminApi.recordAuditLog("campaigns", `Deleted campaign: ${code}`);
    } catch (err) {
      await deleteDoc(doc(db, "discounts", id));
    }
  },

  // GIFT CARDS ───────────────────────────────────────────────────────────────
  // Admin-readable, server-written (firestore.rules). Every change goes through the
  // createStripeCheckoutSession giftCardAdmin action so balances and history stay consistent.
  getGiftCards: async () => {
    const snap = await getDocs(collection(db, "giftCards"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  },
  getGiftCard: async (id: string) => {
    const snap = await getDoc(doc(db, "giftCards", id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as any) : null;
  },
  giftCardAdmin: async <Op extends GiftCardOp>(op: Op, payload: GiftCardBody<Op>) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("You must be signed in as admin.");
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ action: "giftCardAdmin", op, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The gift card couldn't be updated.");
    return result as { ok?: boolean; id?: string; code?: string; last4?: string; balanceMinor?: number; emailError?: string; appliedMinor?: number; clamped?: boolean };
  },

  validateDiscount: async (code: string) => {
    // The discounts collection is admin-only in Firestore rules, so the
    // public checkout validates codes through a Cloud Function. The server
    // re-validates again at payment time regardless.
    const response = await functionFetch("validateDiscountCode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Invalid or expired discount code");
    }
    return data.discount;
  },

  // ANALYTICS
  // One counter bump per shopper session. `increment` is applied by Firestore itself, so two shoppers arriving at
  // once can't overwrite each other's count (the old read-then-write could).
  recordVisit: publicApi.recordVisit,

  // The recorded daily traffic docs only (visits, funnel, sources, devices, searches, bookViews, categoryViews).
  // Sales, categories and referrals are worked out from the orders and books the Overview already loads, so
  // nothing is read twice and every figure comes from the same paid orders. 400 days covers a year plus a
  // little of the block before it.
  /** Daily traffic docs between two UTC day keys (inclusive), oldest first — however far back the window is. */
  // Settled days are kept for the session (dailyTrafficCache.ts); only recent days are read again.
  getDailyAnalyticsBetween: (fromKey: string, toKey: string) => dailyTrafficBetween(fromKey, toKey, async (from, to) => {
    const snap = await getDocs(query(collection(db, "analytics"), where("date", ">=", from), where("date", "<=", to), orderBy("date"), limit(1600)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }),

  /** The oldest daily traffic doc's day (when the shop's own counter started, or was last reset), or null. */
  getFirstAnalyticsDay: async (): Promise<string | null> => {
    const snap = await getDocs(query(collection(db, "analytics"), orderBy("date"), limit(1)));
    return snap.empty ? null : String(snap.docs[0].data().date || snap.docs[0].id).slice(0, 10);
  },

  getDailyAnalytics: async (days = 400) => {
    const snap = await getDocs(query(collection(db, "analytics"), orderBy("date", "desc"), limit(days)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
  },

  // Audience signals for the Overview (admin-only reads per firestore.rules).
  getAudienceSnapshot: async () => {
    const [reviewsSnap, subsSnap, pending, approved] = await Promise.all([
      getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(200))),
      getDocs(query(collection(db, "newsletter"), orderBy("subscribedAt", "desc"), limit(5000))),
      // Counted on the server: the newest 200 reviews can miss older pending ones.
      getCountFromServer(query(collection(db, "reviews"), where("status", "==", "pending"))).then(s => s.data().count).catch(() => null),
      // Approved count and average rating over every approved review (not just the newest 200).
      getAggregateFromServer(query(collection(db, "reviews"), where("status", "==", "approved")), { n: aggregateCount(), avg: average("rating") })
        .then(s => ({ count: Number(s.data().n) || 0, average: typeof s.data().avg === "number" ? (s.data().avg as number) : null })).catch(() => null),
    ]);
    return {
      reviews: reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      // Signups still waiting for the confirmation email click are not subscribers yet.
      subscribers: subsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: any) => d.status !== "pending"),
      // …but they show on the Overview's weekly sign-ups, to spot a confirmation email that isn't arriving.
      pendingSubscribers: subsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: any) => d.status === "pending"),
      pendingReviews: pending as number | null,
      approvedReviews: approved as { count: number; average: number | null } | null,
    };
  },

  // Newsletter sign-ups (ids are the lowercased email) and marketing opt-outs (ids are sha256 of the
  // email; written only by Functions, admin-readable): who may be sent marketing email.
  getMarketingConsent: async () => {
    const [subs, optouts] = await Promise.all([
      getDocs(query(collection(db, "newsletter"), limit(10000))),
      getDocs(query(collection(db, "marketing-optout"), limit(10000))).catch(() => null),
    ]);
    return {
      subscribed: new Set(subs.docs.filter(d => d.data().status !== "pending").map(d => String(d.data().email || d.id).trim().toLowerCase())),
      optedOutHashes: optouts ? new Set<string>(optouts.docs.map(d => d.id)) : null,
    };
  },

  // Private per-customer notes and tags (admin-only `customerNotes/{sha256(lowercased email)}`).
  listCustomerNotes: async () => {
    const snap = await getDocs(query(collection(db, "customerNotes"), limit(10000)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Array<{ id: string; email: string; note: string; tags: string[]; updatedAt: string }>;
  },
  saveCustomerNote: async (id: string, data: { email: string; note: string; tags: string[] }) => {
    await setDoc(doc(db, "customerNotes", id), { ...data, updatedAt: new Date().toISOString() });
  },

  // "Notify me when back in stock" sign-ups (admin-only per firestore.rules): demand the Overview shows beside reprints.
  getStockAlerts: async () => {
    const snap = await getDocs(query(collection(db, "stockAlerts"), limit(2000)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  seedAnalyticsData: async () => {
    const batch: any[] = [];
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const visits = Math.floor(20 + Math.random() * 50);
      const orders = Math.random() > 0.5 ? Math.floor(Math.random() * 3) : 0;
      const revenue = orders * 85;
      
      batch.push(setDoc(doc(db, "analytics", dateStr), {
        date: dateStr,
        visits,
        orders,
        revenue,
        conversion: visits > 0 ? (orders / visits) * 100 : 0
      }));
    }
    await Promise.all(batch);
  },

  // ─────────────────────────────────────────────
  // PAGES  (custom website pages)
  // ─────────────────────────────────────────────
  getPages: async (): Promise<Page[]> => {
    const snap = await getDocs(collection(db, "pages"));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    return docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  getPageBySlug: async (slug: string): Promise<Page | null> => {
    const snap = await getDocs(
      query(collection(db, "pages"), where("slug", "==", slug), limit(1))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Page;
  },

  getPublishedPages: publicApi.getPublishedPages,

  createPage: async (data: any) => {
    const now = new Date().toISOString();
    const docRef = await addDoc(collection(db, "pages"), {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    await adminApi.recordAuditLog("settings", `Created page: ${data.title}`);
    return { id: docRef.id, ...data, createdAt: now, updatedAt: now };
  },

  updatePage: async (id: string, data: any) => {
    const now = new Date().toISOString();
    const payload = { ...data, updatedAt: now };
    delete payload.id;
    await updateDoc(doc(db, "pages", id), payload);
    await adminApi.recordAuditLog("settings", `Updated page: ${data.title || id}`);
    return { id, ...payload };
  },

  deletePage: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, "pages", id));
      const title = snap.exists() ? snap.data().title : id;
      await deleteDoc(doc(db, "pages", id));
      await adminApi.recordAuditLog("settings", `Deleted page: ${title}`);
    } catch (err) {
      await deleteDoc(doc(db, "pages", id));
    }
  },

  recordAuditLog: (type: string, message: string) => auditLog.record(type, message),
};
