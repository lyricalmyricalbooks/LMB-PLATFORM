import { describe, test, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { adminRole, booksReader, memberProblem, supportOf, syncMemberRole, OWNER_EMAILS } = require('./roles');

const OWNER = OWNER_EMAILS[0];

describe('adminRole', () => {
  test('the owner address is always owner, whatever its pass says', () => {
    expect(adminRole({ email: OWNER.toUpperCase(), email_verified: true })).toBe('owner');
    expect(adminRole({ email: OWNER, email_verified: true, role: 'staff' })).toBe('owner');
  });
  test('a Team member gets the role on their pass', () => {
    expect(adminRole({ email: 'sam@press.test', email_verified: true, role: 'staff' })).toBe('staff');
    expect(adminRole({ email: 'sam@press.test', email_verified: true, role: 'owner' })).toBe('owner');
  });
  test('nobody else, and never without a verified email', () => {
    expect(adminRole({ email: 'reader@press.test', email_verified: true })).toBeNull();
    expect(adminRole({ email: 'sam@press.test', email_verified: true, role: 'admin' })).toBeNull();
    expect(adminRole({ email: OWNER, email_verified: false })).toBeNull();
    expect(adminRole({ email: 'sam@press.test', role: 'staff' })).toBeNull();
    expect(adminRole(null)).toBeNull();
  });
  test('an author on the Team never opens the admin', () => {
    expect(adminRole({ email: 'ana@press.test', email_verified: true, role: 'author' })).toBeNull();
  });
});

describe('bookkeeper (plan 7.17)', () => {
  test('a bookkeeper never passes the admin check, so no server action opens for them', () => {
    expect(adminRole({ email: 'kit@press.test', email_verified: true, role: 'bookkeeper' })).toBeNull();
  });
  test('booksReader lets the admin and a verified bookkeeper read the books, nobody else', () => {
    expect(booksReader({ email: 'kit@press.test', email_verified: true, role: 'bookkeeper' })).toBe('bookkeeper');
    expect(booksReader({ email: 'sam@press.test', email_verified: true, role: 'staff' })).toBe('admin');
    expect(booksReader({ email: OWNER, email_verified: true })).toBe('admin');
    expect(booksReader({ email: 'kit@press.test', email_verified: false, role: 'bookkeeper' })).toBeNull();
    expect(booksReader({ email: 'ana@press.test', email_verified: true, role: 'author' })).toBeNull();
    expect(booksReader(null)).toBeNull();
  });
  test('the Team accepts the role, and taking a staff member down to bookkeeper signs them out', async () => {
    expect(memberProblem('kit@press.test', { role: 'bookkeeper' })).toBeNull();
    const { auth, db } = fakes({ claims: { role: 'staff' }, member: { role: 'bookkeeper' } });
    expect(await syncMemberRole({ auth, db, email: 'kit@press.test' })).toEqual({ status: 'updated', role: 'bookkeeper' });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });
});

describe('platform support', () => {
  const later = Math.floor(Date.now() / 1000) + 600;
  const pass = (support, provider = 'custom') => ({ uid: 'colophon-support', firebase: { sign_in_provider: provider }, support });
  test('a support sign-in from the platform is staff until its time runs out', () => {
    expect(adminRole(pass({ by: 'admin@platform.example', reason: 'help with tax', until: later }))).toBe('staff');
    expect(supportOf(pass({ by: 'admin@platform.example', reason: 'help with tax', until: later }))).toEqual({ by: 'admin@platform.example', reason: 'help with tax', until: later });
    expect(adminRole(pass({ by: 'a', until: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });
  test('only a custom sign-in can carry it, and it is never owner', () => {
    expect(adminRole(pass({ until: later }, 'google.com'))).toBeNull();
    expect(adminRole(pass({ until: String(later) }))).toBeNull();
    expect(adminRole(pass(null))).toBeNull();
    expect(adminRole({ ...pass({ until: later }), email: OWNER, email_verified: true, role: 'owner' })).toBe('staff');
  });
});

describe('memberProblem', () => {
  test('accepts an email with a known role', () => {
    expect(memberProblem('Sam@Press.test', { role: 'staff' })).toBeNull();
    expect(memberProblem('ana@press.test', { role: 'author' })).toBeNull();
  });
  test('refuses bad addresses, unknown roles and the owner', () => {
    expect(memberProblem('sam', { role: 'staff' })).toMatch(/email/);
    expect(memberProblem('sam@press.test', { role: 'boss' })).toMatch(/Role/);
    expect(memberProblem(OWNER, { role: 'staff' })).toMatch(/owner/);
  });
});

function fakes({ claims = {}, member, exists = true } = {}) {
  const auth = {
    getUserByEmail: vi.fn(async email => {
      if (!exists) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
      return { uid: 'u1', email, customClaims: claims };
    }),
    setCustomUserClaims: vi.fn(async () => {}),
    revokeRefreshTokens: vi.fn(async () => {}),
  };
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: !!member, data: () => member }) }) }) };
  return { auth, db };
}

describe('syncMemberRole', () => {
  test('puts the Team role on the pass and keeps other claims', async () => {
    const { auth, db } = fakes({ claims: { other: 1 }, member: { role: 'staff' } });
    expect(await syncMemberRole({ auth, db, email: ' Sam@Press.test ' })).toEqual({ status: 'updated', role: 'staff' });
    expect(auth.getUserByEmail).toHaveBeenCalledWith('sam@press.test');
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { other: 1, role: 'staff' });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  test('takes the role away when the person leaves the Team, and signs them out', async () => {
    const { auth, db } = fakes({ claims: { role: 'staff', other: 1 } });
    expect(await syncMemberRole({ auth, db, email: 'sam@press.test' })).toEqual({ status: 'updated', role: null });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { other: 1 });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });
  test('does nothing when the pass already matches', async () => {
    const { auth, db } = fakes({ claims: { role: 'staff' }, member: { role: 'staff' } });
    expect(await syncMemberRole({ auth, db, email: 'sam@press.test' })).toEqual({ status: 'unchanged', role: 'staff' });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  test('waits for a person who has not signed in yet', async () => {
    const { auth, db } = fakes({ exists: false, member: { role: 'staff' } });
    expect(await syncMemberRole({ auth, db, email: 'new@press.test' })).toEqual({ status: 'no-account' });
  });
  test('never writes a role for the owner address, which needs none', async () => {
    const { auth, db } = fakes({ member: { role: 'staff' } });
    expect(await syncMemberRole({ auth, db, email: OWNER })).toEqual({ status: 'unchanged', role: null });
  });
  test('puts the author role on the pass', async () => {
    const { auth, db } = fakes({ member: { role: 'author' } });
    expect(await syncMemberRole({ auth, db, email: 'ana@press.test' })).toEqual({ status: 'updated', role: 'author' });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'author' });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  test('signs the person out when their role gets smaller, so an old pass stops working sooner', async () => {
    for (const [from, to] of [['staff', 'author'], ['owner', 'staff'], ['owner', 'author']]) {
      const { auth, db } = fakes({ claims: { role: from }, member: { role: to } });
      expect(await syncMemberRole({ auth, db, email: 'sam@press.test' })).toEqual({ status: 'updated', role: to });
      expect(auth.revokeRefreshTokens, `${from} to ${to}`).toHaveBeenCalledWith('u1');
    }
  });
  test('keeps the person signed in when they move up to owner', async () => {
    const { auth, db } = fakes({ claims: { role: 'staff' }, member: { role: 'owner' } });
    expect(await syncMemberRole({ auth, db, email: 'sam@press.test' })).toEqual({ status: 'updated', role: 'owner' });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  test('ignores an unknown role in the Team entry', async () => {
    const { auth, db } = fakes({ claims: { role: 'staff' }, member: { role: 'boss' } });
    expect((await syncMemberRole({ auth, db, email: 'sam@press.test' })).role).toBeNull();
  });
});
