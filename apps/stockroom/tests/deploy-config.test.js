// @vitest-environment node
// The stockroom's deploy files inside a shop's project (plan 1.20): its own Hosting site, its own named Firestore
// database and bucket, and rules with the shop's owner filled in (scripts/deployConfig.mjs). The Hosting settings are
// checked against a build in hosting-check.test.js.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_FILE, OUT_DIR, OWNER_PLACEHOLDER, RULE_FILES, buildFirebaseConfig, fillRules, ownerAddress, readServedProfile,
  stockroomPlace, stockroomSite, writeDeployFiles,
} from '../scripts/deployConfig.mjs';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const template = JSON.parse(read('firebase.json'));
const place = { firestoreDatabase: 'stockroom', storageBucket: 'moth-press-stockroom' };
const profile = (projectId = 'moth-press', stockroom = place) => ({ firebase: { projectId }, ...(stockroom ? { stockroom } : {}) });

describe('rules templates', () => {
  it('name the owner only through the slot, never a real address', () => {
    for (const file of RULE_FILES) {
      const text = read(file);
      expect(text, file).toContain(OWNER_PLACEHOLDER);
      expect(text.replace(/\/\/.*$/gm, ''), file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    }
  });

  it('fill every slot with the owner, and point Storage at the stockroom database', () => {
    for (const file of RULE_FILES) {
      const filled = fillRules(file, read(file), { owner: ' Owner@Press.Test ', database: 'stockroom' });
      expect(filled).not.toContain(OWNER_PLACEHOLDER);
      expect(filled).not.toContain('(default)');
      expect(filled.split('owner@press.test').length).toBe(read(file).split(OWNER_PLACEHOLDER).length);
    }
    const storage = fillRules('storage.rules', read('storage.rules'), { owner: 'owner@press.test', database: 'stockroom' });
    expect(storage).toContain('firestore.get(/databases/stockroom/documents/settings/bookOwners)');
    expect(storage).toContain('firestore.exists(/databases/stockroom/documents/settings/bookOwners)');
    // The database rules stay valid JSON once filled.
    const db = fillRules('database.rules.json', read('database.rules.json'), { owner: 'owner@press.test', database: 'stockroom' });
    expect(() => JSON.parse(db.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n'))).not.toThrow();
  });

  it('refuse a missing or unsafe owner, or a bad database id, rather than write broken rules', () => {
    for (const bad of ['', 'owner', "a'@b.co", 'a"@b.co', 'a b@c.co', OWNER_PLACEHOLDER, undefined]) {
      expect(ownerAddress(bad), String(bad)).toBe('');
      expect(() => fillRules('firestore.rules', read('firestore.rules'), { owner: bad, database: 'stockroom' }), String(bad)).toThrow(/owner/);
    }
    for (const bad of ['(default)', '', 'Stock room', undefined]) {
      expect(() => fillRules('storage.rules', read('storage.rules'), { owner: 'o@press.test', database: bad }), String(bad)).toThrow(/database id/);
    }
    expect(() => fillRules('firestore.rules', 'allow read: if true;', { owner: 'o@press.test', database: 'stockroom' })).toThrow(/doesn't name/);
  });
});

describe('firebase.deploy.json', () => {
  it("is the template with the stockroom's own site, database and bucket and the filled-in rules", () => {
    const config = buildFirebaseConfig(template, 'moth-press', place);
    expect(config.hosting.site).toBe('moth-press-stockroom');
    expect(stockroomSite('moth-press')).toBe('moth-press-stockroom');
    expect(config.firestore).toEqual([{ database: 'stockroom', rules: `${OUT_DIR}/firestore.rules` }]);
    expect(config.storage).toEqual([{ bucket: 'moth-press-stockroom', rules: `${OUT_DIR}/storage.rules` }]);
    expect(config.database).toEqual({ rules: `${OUT_DIR}/database.rules.json` });
    // Never the shop's pieces: not the default site, database or bucket.
    expect(config.hosting.site).not.toBe('moth-press');
    expect(JSON.stringify(config)).not.toContain('(default)');
    expect(config.hosting).toEqual({ ...template.hosting, site: 'moth-press-stockroom' });
    expect(template.firestore[0].rules).toBe('firestore.rules');
  });

  it('refuses a malformed project, another project than the profile, or a profile without the stockroom place', () => {
    for (const bad of ['', 'Shop', 'a', 'has_underscore']) expect(() => buildFirebaseConfig(template, bad, place)).toThrow(/project id/);
    expect(() => stockroomPlace(profile('other-press'), 'moth-press')).toThrow(/another project/);
    expect(() => stockroomPlace(profile('moth-press', null), 'moth-press')).toThrow(/own database and bucket/);
    expect(() => stockroomPlace(profile('moth-press', { firestoreDatabase: 'stockroom' }), 'moth-press')).toThrow(/own database and bucket/);
    expect(stockroomPlace(profile(), 'moth-press')).toEqual(place);
  });

  it('reads the profile from the served file', () => {
    expect(readServedProfile(read('public/shop-profile.js')).firebase.projectId).toBe('lmb-test-stockroom');
    expect(readServedProfile('throw new Error()')).toBeNull();
  });

  it('writes the deploy files next to the templates, and nothing when something is wrong', () => {
    const root = mkdtempSync(join(tmpdir(), 'stockroom-deploy-'));
    try {
      for (const file of ['firebase.json', ...RULE_FILES]) cpSync(join(ROOT, file), join(root, file));
      expect(() => writeDeployFiles({ root, projectId: 'moth-press', owner: '', profile: profile() })).toThrow(/owner/);
      expect(() => writeDeployFiles({ root, projectId: 'moth-press', owner: 'o@press.test', profile: profile('other-press') })).toThrow();
      expect(existsSync(join(root, CONFIG_FILE))).toBe(false);
      expect(existsSync(join(root, OUT_DIR))).toBe(false);
      const written = writeDeployFiles({ root, projectId: 'moth-press', owner: 'o@press.test', profile: profile() });
      expect(written.sort()).toEqual([CONFIG_FILE, ...RULE_FILES.map((f) => join(OUT_DIR, f))].sort());
      const config = JSON.parse(readFileSync(join(root, CONFIG_FILE), 'utf8'));
      for (const path of [config.firestore[0].rules, config.storage[0].rules, config.database.rules]) {
        expect(readFileSync(join(root, path), 'utf8')).toContain('o@press.test');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the deploy files are never committed', () => {
    const ignored = read('.gitignore');
    expect(ignored).toMatch(/^\.deploy\/$/m);
    expect(ignored).toMatch(/^firebase\.deploy\.json$/m);
  });
});
