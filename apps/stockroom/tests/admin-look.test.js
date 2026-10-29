// The stockroom's old colour names now follow the shared admin look (plan step 11.3). In Riso Press they must keep
// the exact values they had, day and night; Paper is the one new look.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAdminLook, applyAdminLook, readAdminLook, writeAdminLook } from '../src/lib/admin-look.js';
import { applyThemeToDocument } from '../src/lib/theme.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => readFileSync(join(root, f), 'utf8');

const norm = (v) => String(v).toLowerCase().replace(/\s+/g, '').replace(/(^|[^\d])0\./g, '$1.');
function decls(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no ${selector}`);
  const j = css.indexOf('{', i);
  const k = css.indexOf('\n}', j);
  const out = {};
  for (const m of css.slice(j, k).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = norm(m[2].trim());
  return out;
}

const shared = rd('src/styles/admin-look/adminThemes.css');
const bridge = rd('src/styles/admin-look/stockroom-bridge.css');
const day = decls(shared, '.rp,\n.admin-reso {');
const night = { ...day, ...decls(shared, '.admin-reso[data-admin-theme="dark"] {') };
const oldDay = decls(rd('src/style.css'), ':root {');
const oldNight = { ...oldDay, ...decls(rd('src/styles/theme-dark.css'), ':root[data-theme="dark"] {') };
const aliases = [...bridge.matchAll(/(--[\w-]+):\s*var\((--rp-[\w-]+)\);/g)].map((m) => [m[1], m[2]]);

describe('the stockroom follows the shared admin look', () => {
  it('points a good set of its colour names at the shared tokens', () => {
    expect(aliases.length).toBeGreaterThan(20);
    for (const [, rp] of aliases) expect(day[rp], rp).toBeDefined();
  });

  it.each(aliases)('%s keeps its Riso Press value by day and by night (via %s)', (old, rp) => {
    expect(day[rp]).toBe(oldDay[old]);
    expect(night[rp]).toBe(oldNight[old]);
  });

  it('stays on screen: printed pages keep the light colours', () => {
    expect(bridge).toMatch(/@media screen\s*{\s*body\.rp\s*{/);
  });

  it('is loaded after the dark theme, and the body starts as .rp', () => {
    const main = rd('src/main.js');
    expect(main.indexOf('stockroom-bridge.css')).toBeGreaterThan(main.indexOf('theme-dark.css'));
    expect(rd('index.html')).toMatch(/<body class="rp">/);
  });
});

describe('the look choice', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('defaults to Riso Press and only accepts the two looks', () => {
    expect(normalizeAdminLook('paper')).toBe('paper');
    expect(normalizeAdminLook('anything')).toBe('riso');
    expect(readAdminLook(store())).toBe('riso');
  });
  it('is remembered', () => {
    const s = store();
    writeAdminLook('paper', s);
    expect(readAdminLook(s)).toBe('paper');
  });
  it('is written on <html>, absent for Riso Press', () => {
    const attrs = {};
    const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } };
    applyAdminLook('paper', { document: doc });
    expect(attrs['data-admin-look']).toBe('paper');
    applyAdminLook('riso', { document: doc });
    expect(attrs['data-admin-look']).toBeUndefined();
  });
  it('day or night is written on <body> with the .rp class', () => {
    const body = { classes: new Set(), attrs: {}, classList: { add(c) { body.classes.add(c); } }, setAttribute(k, v) { body.attrs[k] = v; } };
    const root = { setAttribute() {}, removeAttribute() {}, classList: { toggle() {} }, style: { removeProperty() {} } };
    applyThemeToDocument('dark', { document: { documentElement: root, body, querySelector: () => null }, prefersDark: false });
    expect(body.classes.has('rp')).toBe(true);
    expect(body.attrs['data-rp-appearance']).toBe('dark');
  });
});
