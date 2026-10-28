import { describe, expect, it, vi } from 'vitest';
import { emulatorSettings, EMULATOR_PORTS } from '../src/lib/emulators.js';

describe("the demo shop's emulator switch", () => {
  it('is off by default', () => {
    expect(emulatorSettings()).toBeNull();
    expect(emulatorSettings({}, 'demo-colophon-test')).toBeNull();
    expect(emulatorSettings(import.meta.env, 'demo-colophon-test')).toBeNull();
  });

  it('is off for any value but true', () => {
    for (const value of ['', '1', 'TRUE', 'yes', 'false']) expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: value }, 'demo-colophon-test')).toBeNull();
  });

  it('turns on for a demo- project', () => {
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: 'true' }, 'demo-colophon-test')).toEqual({ host: '127.0.0.1', ports: EMULATOR_PORTS });
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_EMULATOR_HOST: 'localhost' }, 'demo-x').host).toBe('localhost');
  });

  it('never points a real project at the emulators', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(emulatorSettings({ VITE_FIREBASE_EMULATORS: 'true' }, 'lmb-test-stockroom')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
