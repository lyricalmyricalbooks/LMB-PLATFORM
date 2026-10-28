import { describe, expect, it, vi } from "vitest";
import { emulators, emulatorSettings, emulatorUrl, EMULATOR_PORTS } from "./emulators";

describe("the demo shop's emulator switch", () => {
  it("is off by default", () => {
    expect(emulators).toBeNull();
    expect(emulatorSettings({}, "demo-colophon-test")).toBeNull();
  });

  it("is off for any value but true", () => {
    for (const value of ["", "1", "TRUE", "yes", "false"]) expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: value }, "demo-colophon-test")).toBeNull();
  });

  it("turns on for a demo- project", () => {
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: "true" }, "demo-colophon-test")).toEqual({ host: "127.0.0.1", ports: EMULATOR_PORTS });
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: "true", VITE_FIREBASE_EMULATOR_HOST: " localhost " }, "demo-x")?.host).toBe("localhost");
  });

  it("never points a real project at the emulators", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: "true" }, "lmb-test-shop")).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("names each emulator's address", () => {
    const settings = emulatorSettings({ VITE_FIREBASE_EMULATORS: "true" }, "demo-colophon-test")!;
    expect(emulatorUrl(settings, "auth")).toBe("http://127.0.0.1:9099");
    expect(emulatorUrl(settings, "functions")).toBe("http://127.0.0.1:5001");
  });
});
