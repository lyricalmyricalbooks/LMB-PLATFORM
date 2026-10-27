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

  it('treats a pass that cannot be read, or not in time, as no role', async () => {
    expect(await readPassClaims({ getIdTokenResult: () => Promise.reject(new Error('offline')) })).toEqual({});
    expect(await readPassClaims({ getIdTokenResult: () => new Promise(() => {}) }, 10)).toEqual({});
    expect(await readPassClaims({})).toEqual({});
  });
});
