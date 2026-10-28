import { describe, it, expect } from 'vitest';
import { OWNER_EMAIL, isPublisherPass, isPublisherUser, readPassClaims } from '../src/lib/publisher-access.js';

const user = (email, emailVerified = true, claims = {}) => ({
  email, emailVerified, getIdTokenResult: async () => ({ claims }),
});

describe('publisher access', () => {
  it('lets in the verified owner address without reading the pass', async () => {
    const owner = { email: ` ${OWNER_EMAIL.toUpperCase()} `, emailVerified: true, getIdTokenResult: () => { throw new Error('not needed'); } };
    expect(await isPublisherUser(owner)).toBe(true);
  });

  it('lets in a verified account with the owner role', async () => {
    expect(await isPublisherUser(user('second@example.com', true, { role: 'owner' }))).toBe(true);
  });

  it('keeps staff, authors and other accounts out', async () => {
    expect(await isPublisherUser(user('staff@example.com', true, { role: 'staff' }))).toBe(false);
    expect(await isPublisherUser(user('author@example.com'))).toBe(false);
    expect(await isPublisherUser(user('author@example.com', true, { role: 'author' }))).toBe(false);
    expect(await isPublisherUser(null)).toBe(false);
  });

  it('needs a verified email, even with the owner address or role', async () => {
    expect(await isPublisherUser(user(OWNER_EMAIL, false))).toBe(false);
    expect(await isPublisherUser(user('second@example.com', false, { role: 'owner' }))).toBe(false);
    expect(isPublisherPass(user('second@example.com', false), { role: 'owner' })).toBe(false);
  });

  // A shop without the shop app has no server to put the owner role on the pass; the page asks the rules instead.
  describe('asking the rules (owner with no role on the pass)', () => {
    const memory = () => {
      const m = new Map();
      return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
    };
    const owner = { ...user('real-owner@press.example'), uid: 'u-owner' };

    it('lets in the account the rules allow, and remembers it for an offline start', async () => {
      const store = memory();
      expect(await isPublisherUser(owner, { askRules: async () => true, store })).toBe(true);
      expect(await isPublisherUser(owner, { askRules: async () => null, store })).toBe(true);
    });

    it('keeps out an account the rules refuse, and forgets an earlier yes', async () => {
      const store = memory();
      await isPublisherUser(owner, { askRules: async () => true, store });
      expect(await isPublisherUser(owner, { askRules: async () => false, store })).toBe(false);
      expect(await isPublisherUser(owner, { askRules: async () => null, store })).toBe(false);
    });

    it('never lets in on another account remembered on this device, an unverified email, or no answer at all', async () => {
      const store = memory();
      await isPublisherUser(owner, { askRules: async () => true, store });
      const other = { ...user('someone@press.example'), uid: 'u-other' };
      expect(await isPublisherUser(other, { askRules: async () => null, store })).toBe(false);
      expect(await isPublisherUser({ ...owner, emailVerified: false }, { askRules: async () => true, store })).toBe(false);
      expect(await isPublisherUser({ ...user('new@press.example'), uid: 'u-new' }, { askRules: async () => { throw new Error('boom'); }, store: memory() })).toBe(false);
      expect(await isPublisherUser(owner, { store: memory() })).toBe(false);
    });

    it('does not ask when the pass already answers', async () => {
      let asked = 0;
      const second = { ...user('second@example.com', true, { role: 'owner' }), uid: 'u2' };
      expect(await isPublisherUser(second, { askRules: async () => { asked++; return false; } })).toBe(true);
      expect(asked).toBe(0);
    });

    it('works when the browser blocks storage', async () => {
      const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
      expect(await isPublisherUser(owner, { askRules: async () => true, store: blocked })).toBe(true);
      expect(await isPublisherUser(owner, { askRules: async () => null, store: blocked })).toBe(false);
    });
  });

  it('treats a pass that cannot be read, or not in time, as no role', async () => {
    expect(await readPassClaims({ getIdTokenResult: () => Promise.reject(new Error('offline')) })).toEqual({});
    expect(await readPassClaims({ getIdTokenResult: () => new Promise(() => {}) }, 10)).toEqual({});
    expect(await readPassClaims({})).toEqual({});
  });
});
