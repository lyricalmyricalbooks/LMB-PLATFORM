import { shopProfile } from "./shopProfile";

/**
 * The demo shop (LMB-PLATFORM `npm run demo`, docs/demo-shop.md): the shop on one computer, against the Firebase Local
 * Emulator Suite instead of Google. Off unless the build is started with VITE_FIREBASE_EMULATORS=true AND the profile's
 * project is a made-up `demo-` one, which the emulators never send to Google. A real shop's build and profile never
 * set either, so nothing changes for them. The ports are the demo's (LMB-PLATFORM demo/config.js PORTS).
 */
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 } as const;

export type EmulatorSettings = { host: string; ports: typeof EMULATOR_PORTS };
type EmulatorEnvironment = { VITE_FIREBASE_EMULATORS?: string; VITE_FIREBASE_EMULATOR_HOST?: string; [key: string]: unknown };

export function emulatorSettings(
  env: EmulatorEnvironment = import.meta.env,
  projectId: string = shopProfile.firebase.projectId,
): EmulatorSettings | null {
  if (env.VITE_FIREBASE_EMULATORS !== "true") return null;
  if (!projectId.startsWith("demo-")) {
    console.warn("The emulator switch is on, but this shop's project isn't a demo- one, so the real project is used.");
    return null;
  }
  return { host: env.VITE_FIREBASE_EMULATOR_HOST?.trim() || "127.0.0.1", ports: EMULATOR_PORTS };
}

/** This page's emulator settings, or null (every real shop). */
export const emulators = emulatorSettings();

/** The address of one emulator, such as the sign-in emulator's http://127.0.0.1:9099. */
export const emulatorUrl = (settings: EmulatorSettings, name: keyof typeof EMULATOR_PORTS) => `http://${settings.host}:${settings.ports[name]}`;
