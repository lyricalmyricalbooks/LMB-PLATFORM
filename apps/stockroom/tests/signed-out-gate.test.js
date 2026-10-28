import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { signInAs, signInAsPublisher } from './helpers/fake-cloud.js';

// Plan 5.0c. With nobody signed in the stockroom shows its sign-in screen,
// never an empty dashboard that looks like lost data, and a sign-in that ends
// later returns there too. The test page runs on localhost, where the app used
// to open the publisher's dashboard with nobody signed in.
const shown = (id) => document.getElementById(id).style.display !== 'none';
const gateText = () => document.getElementById('gate-desc').textContent;

describe('signed out, the stockroom shows its sign-in screen', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'harbour' })], signedOut: true });
  }, 30000);
  afterAll(() => vi.restoreAllMocks());

  it('runs on localhost, where the old shortcut opened the dashboard', () => {
    expect(window.location.hostname).toBe('localhost');
  });

  it('shows the sign-in screen and hides the dashboard when nobody is signed in', () => {
    expect(shown('pw-gate')).toBe(true);
    expect(shown('pw-app')).toBe(false);
    expect(gateText()).toContain('Sign in to see your stockroom');
    expect(gateText()).not.toMatch(/ended/);
    expect(app.window.IS_PUBLISHER).not.toBe(true);
    expect(app.main.states.harbour).toBeUndefined();
  });

  it('opens the dashboard once the publisher signs in', async () => {
    await signInAsPublisher();
    await vi.waitFor(() => { if (!app.main.states.harbour) throw new Error('not loaded'); }, { timeout: 10000, interval: 10 });
    await app.settle(10);
    expect(shown('pw-app')).toBe(true);
    expect(shown('pw-gate')).toBe(false);
  });

  it('goes back to the sign-in screen when the sign-in ends, and says nothing was lost', async () => {
    await signInAs(null);
    expect(shown('pw-gate')).toBe(true);
    expect(shown('pw-app')).toBe(false);
    expect(gateText()).toContain('Your sign-in has ended');
    expect(gateText()).toContain('Nothing was lost');
    // A calm note, not a red refusal.
    expect(document.querySelector('#gate-desc .gate-desc-err')).toBeNull();
    expect(gateText()).toContain('Sign in to see your stockroom');
  });
});
