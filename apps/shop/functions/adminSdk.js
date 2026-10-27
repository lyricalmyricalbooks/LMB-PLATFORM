// firebase-admin 14 removed the namespaced API (admin.firestore(), admin.auth(), admin.storage(),
// admin.app(), admin.credential…). The Functions, the restore/migration scripts and the handler tests'
// fakes are all written against that shape, so this rebuilds it from the modular entry points.
// A module that still has it (a test's fake firebase-admin, or firebase-admin 13) is returned as it is.

function adminSdk(mod) {
  if (typeof mod.firestore === "function") return mod;
  const fs = require("firebase-admin/firestore");
  const firestore = app => (app ? fs.getFirestore(app) : fs.getFirestore());
  Object.assign(firestore, {
    FieldValue: fs.FieldValue,
    FieldPath: fs.FieldPath,
    Timestamp: fs.Timestamp,
    GeoPoint: fs.GeoPoint,
  });
  // The generated admin client loads lazily in firebase-admin; only the backup export needs it.
  Object.defineProperty(firestore, "v1", { get: () => fs.v1, enumerable: true });
  return {
    initializeApp: (...args) => mod.initializeApp(...args),
    app: name => (name ? mod.getApp(name) : mod.getApp()),
    get apps() { return mod.getApps(); },
    firestore,
    auth: app => require("firebase-admin/auth").getAuth(app),
    storage: app => require("firebase-admin/storage").getStorage(app),
    appCheck: app => require("firebase-admin/app-check").getAppCheck(app),
    credential: { applicationDefault: (...args) => mod.applicationDefault(...args), cert: (...args) => mod.cert(...args) },
  };
}

module.exports = adminSdk;
