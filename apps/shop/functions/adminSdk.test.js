// firebase-admin 14 has no admin.firestore()/admin.auth() namespace; adminSdk rebuilds the shape the
// Functions use from the real modular SDK. Nothing here talks to a server: it only builds clients.
import { afterAll, describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const adminSdk = require("./adminSdk");
const real = require("firebase-admin");
const admin = adminSdk(real);

describe("adminSdk on the installed firebase-admin", () => {
  const app = admin.initializeApp({ projectId: "demo-admin-sdk", storageBucket: "demo-admin-sdk.firebasestorage.app" }, "admin-sdk-test");
  afterAll(() => real.deleteApp ? real.deleteApp(app) : app.delete());

  test("gives every piece of the namespaced API the Functions call", () => {
    expect(admin.app("admin-sdk-test").options.projectId).toBe("demo-admin-sdk");
    expect(() => admin.app("missing-app")).toThrow();
    expect(admin.apps.some(a => a.name === "admin-sdk-test")).toBe(true);

    const db = admin.firestore(app);
    expect(typeof db.collection("orders").doc("x").get).toBe("function");
    expect(admin.firestore.FieldValue.increment(1)).toBeTruthy();
    expect(admin.firestore.FieldValue.arrayUnion("a")).toBeTruthy();
    expect(admin.firestore.FieldValue.delete()).toBeTruthy();
    expect(admin.firestore.FieldPath.documentId()).toBeTruthy();
    expect(admin.firestore.Timestamp.fromMillis(0).toMillis()).toBe(0);
    expect(new admin.firestore.GeoPoint(1, 2).latitude).toBe(1);
    expect(typeof admin.firestore.v1.FirestoreAdminClient).toBe("function");

    expect(typeof admin.auth(app).verifyIdToken).toBe("function");
    expect(admin.storage(app).bucket().name).toBe("demo-admin-sdk.firebasestorage.app");
    expect(typeof admin.appCheck(app).verifyToken).toBe("function");
    expect(typeof admin.credential.applicationDefault).toBe("function");
  });

  test("leaves a module that already has the namespace alone", () => {
    const fake = { firestore: () => ({}) };
    expect(adminSdk(fake)).toBe(fake);
  });
});
