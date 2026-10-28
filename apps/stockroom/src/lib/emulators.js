// The demo shop (LMB-PLATFORM `npm run demo`, docs/demo-shop.md): the stockroom on one computer, against the Firebase
// Local Emulator Suite instead of Google. Off unless the page is built with VITE_FIREBASE_EMULATORS=true AND the
// profile's project is a made-up `demo-` one, which the emulators never send to Google. A real shop's build and profile
// never set either. The ports are the demo's (LMB-PLATFORM demo/config.js PORTS); the shop reads the same ones
// (apps/shop/src/lib/emulators.ts).
export const EMULATOR_PORTS = Object.freeze({ auth: 9099, firestore: 8080, database: 9000, storage: 9199 });

/** `{ host, ports }` when the stockroom should use the emulators, else null. */
export function emulatorSettings(env = {}, projectId = '') {
  if (env?.VITE_FIREBASE_EMULATORS !== 'true') return null;
  if (!String(projectId).startsWith('demo-')) {
    console.warn("The emulator switch is on, but this shop's project isn't a demo- one, so the real project is used.");
    return null;
  }
  const host = typeof env.VITE_FIREBASE_EMULATOR_HOST === 'string' && env.VITE_FIREBASE_EMULATOR_HOST.trim() ? env.VITE_FIREBASE_EMULATOR_HOST.trim() : '127.0.0.1';
  return { host, ports: EMULATOR_PORTS };
}
