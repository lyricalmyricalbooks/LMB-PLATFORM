// Code plan 6.16: nothing technical reaches a press. A stockroom run by Colophon must show its press no Firebase, Google
// Cloud, API, key, webhook, secret, DNS, CNAME, TXT, Resend or deploy. The list is the platform's one list,
// plain-words/banned.json (also read by the platform's own pages and emails and by the shop's admin).
//
// Two ways of reading the stockroom:
//   1. index.html, the screens, as a press reads them (text, titles, placeholders, labels). A banned word passes only
//      inside a panel marked `data-own-accounts` (hidden on a Colophon shop by src/style.css, switched by
//      src/lib/shop-profile.js runsOnColophon), inside a part of the old shop system that is switched off for new shops, or
//      as an allowed plain use.
//   2. The words the app's code writes onto those screens (messages, toasts, rows). Words in a line marked
//      `Own-account shops only` pass. The rest are listed in plainWords.known.json, word for word: this test fails for a
//      technical sentence that is NOT on the list (so nothing new gets in) and for a listed one that no longer exists
//      (so the list only shrinks). They belong to features that need a carrier, AI, Stripe or Google Sheet account of the
//      press's own, which a Colophon shop has no way to set up; they go as those features get platform versions.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { DEFAULT_SHOP_PROFILE, parseShopProfile, runsOnColophon } from '../src/lib/shop-profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const BANNED = JSON.parse(readFileSync(join(APP, '..', '..', 'plain-words', 'banned.json'), 'utf8')).banned
  .map((b) => ({ word: b.word, regex: new RegExp(b.pattern, b.flags) }));

// Words used in their plain, non-technical sense. Each phrase stays only because of the reason beside it.
const ALLOWED = [
  // The keyboard's keys, not a secret key.
  'arrow keys', 'Arrow keys', 'Enter key', 'Escape key',
  // "Key" meaning "main" or "the legend of a chart".
  'Key figures', 'key metrics', 'Key dates', 'Key numbers', 'Chart key', 'Map key',
  // "Resend" as a verb on a button that sends an email again, not the email company.
  'Resend email', 'Resend receipt', 'Resend the email', 'resend the email', 'Resend invoice', 'or resend it', 'resend or refund', 'resend it',
];

function banned(text, allowed = ALLOWED) {
  let rest = text;
  for (const phrase of allowed) rest = rest.split(phrase).join(' ');
  return BANNED.filter((b) => b.regex.test(rest)).map((b) => b.word);
}

const MARKER = 'Own-account shops only';

// ── 1. The screens ─────────────────────────────────────────────────────────────────────────────────────────────────────

// Parts of the page a Colophon shop never shows: panels asking for a press's own account, the old shop system and the
// Gmail order scan (both off unless a shop's profile switches them on).
const HIDDEN_ON_COLOPHON = '[data-own-accounts], [data-old-shop-sync], [data-gmail-order-scan]';
const ATTRIBUTES_READ = ['title', 'placeholder', 'aria-label', 'alt'];

function screenWords(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const words = [];
  const walk = (node) => {
    if (node.nodeType === 3) { const text = node.textContent.replace(/\s+/g, ' ').trim(); if (text) words.push({ text, at: node.parentElement }); return; }
    if (node.nodeType !== 1) return;
    if (/^(script|style|template)$/i.test(node.tagName) || node.matches(HIDDEN_ON_COLOPHON)) return;
    for (const name of ATTRIBUTES_READ) { const value = (node.getAttribute(name) || '').trim(); if (value) words.push({ text: value, at: node }); }
    for (const child of node.childNodes) walk(child);
  };
  walk(doc.documentElement);
  return words;
}

const describeAt = (el) => `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''}>`;

describe('a stockroom run by Colophon: the screens', () => {
  const html = readFileSync(join(APP, 'index.html'), 'utf8');

  it('no technical word is on a screen a Colophon shop shows', () => {
    const found = [];
    for (const w of screenWords(html)) {
      const hit = banned(w.text);
      if (hit.length) found.push(`${describeAt(w.at)} ${hit.join(', ')}: “${w.text.slice(0, 110)}”`);
    }
    expect(found).toEqual([]);
  });

  it('the panels left out of that reading are hidden on a Colophon shop', () => {
    const css = readFileSync(join(APP, 'src', 'style.css'), 'utf8');
    expect(css).toMatch(/\[data-colophon\]\s+\[data-own-accounts\]\s*\{\s*display:\s*none\s*!important/);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // The AI, carrier, Stripe-reading and Google Sheet panels: the Tax Centre's Integrations tab and page, the Payments
    // key box, the Shippo key card, the Sheets Connection tab and page, the invoice pay-link key and the buyers pull.
    for (const id of ['btn-tctab-integrations', 'tc-sec-integrations', 'recon-keyrow', 'cust-stripe-btn', 'btn-subtab-sync', 'settings-sec-sync']) {
      expect(doc.getElementById(id)?.hasAttribute('data-own-accounts'), id).toBe(true);
    }
    expect(doc.querySelectorAll('[data-own-accounts]').length).toBeGreaterThanOrEqual(9);
    // The old shop system's page is hidden by its switch (off for a new shop), not by the platform mark.
    expect(doc.getElementById('tab-bigcartel')?.hasAttribute('data-old-shop-sync')).toBe(true);
  });

  it('a shop the platform made is told apart from the test settings and from a shop with its own keys', () => {
    const profile = (extra = {}) => parseShopProfile({
      version: 1, shopId: 'moth-press', functionsRegion: 'northamerica-northeast1', siteUrl: 'https://moth-press.example',
      firebase: { apiKey: 'k', authDomain: 'a.example', projectId: 'moth-press', storageBucket: 'b', messagingSenderId: '1', appId: '1:1:web:a' },
      apps: { shop: true, stockroom: true }, ...extra,
    });
    expect(runsOnColophon(DEFAULT_SHOP_PROFILE)).toBe(false);
    expect(runsOnColophon(profile())).toBe(true);
    expect(runsOnColophon(profile({ payments: { provider: 'stripe', mode: 'platform', stripe: { accountId: 'acct_x' } } }))).toBe(true);
    expect(runsOnColophon(profile({ payments: { provider: 'stripe', mode: 'own' } }))).toBe(false);
    // Only the mode is kept; anything else in the block stays out of the app.
    expect(profile({ payments: { provider: 'stripe', mode: 'platform', stripe: { accountId: 'acct_x' } } }).payments).toEqual({ mode: 'platform' });
    expect(profile({ payments: { mode: 'something-else' } }).payments).toBeUndefined();
  });

  it('the reader sees a stray word, a hidden panel and an allowed plain use', () => {
    const words = (markup) => screenWords(`<body>${markup}</body>`).filter((w) => banned(w.text).length).map((w) => w.text);
    expect(words('<p>Paste your key</p>')).toEqual(['Paste your key']);
    expect(words('<input placeholder="Your API token">')).toEqual(['Your API token']);
    expect(words('<div data-own-accounts><p>Paste your key</p></div>')).toEqual([]);
    expect(words('<p>Use the arrow keys</p>')).toEqual([]);
    expect(banned('The webhook failed. Deploy it with your API key. DNS, CNAME, TXT, Firebase, Google Cloud, secret, Resend.').sort()).toEqual(BANNED.map((b) => b.word).sort());
  });
});

// ── 2. The words the code writes ───────────────────────────────────────────────────────────────────────────────────────

const KNOWN = join(HERE, 'plainWords.known.json');

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}

/** The sentences a source file writes: string and template text that reads like words, tags and attributes taken out. */
function sentencesIn(source) {
  const lines = source.split('\n');
  const tree = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowReturnOutsideFunction: true });
  const out = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'console') return;
    let raw = null;
    if (node.type === 'Literal' && typeof node.value === 'string') raw = node.value;
    else if (node.type === 'TemplateLiteral') raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('§');
    // A piece that starts inside a tag (`class="x" onclick=…`) is markup, not words.
    if (raw !== null && !/^\s*[\w:-]+=["'§]/.test(raw)) {
      const text = raw
        .replace(/<(script|style)\b[\s\S]*?(?:<\/\1>|$)/gi, ' ')
        // A tag, with quoted attribute values that may hold a ">" (an arrow function) or a "§" (a value in a template).
        .replace(/<\/?[A-Za-z][^\s/>]*(?:"[^"]*"|'[^']*'|[^>"'])*>?/g, ' ')
        .replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]{2,} [A-Za-z]{2,}/.test(text) || /^[A-Z][a-z]+$/.test(text)) {
        const marked = lines.slice(node.loc.start.line - 1, node.loc.end.line).some((line) => line.includes(MARKER));
        out.push({ text, line: node.loc.start.line, marked });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(tree);
  return out;
}

function technicalSentences() {
  const found = new Map();
  for (const file of sourceFiles(join(APP, 'src'))) {
    const path = relative(APP, file).split(sep).join('/'); // the same slashes on Windows as in plainWords.known.json
    for (const s of sentencesIn(readFileSync(file, 'utf8'))) {
      if (s.marked || !banned(s.text).length) continue;
      found.set(`${path}: ${s.text.slice(0, 160)}`, `${path}:${s.line}`);
    }
  }
  return found;
}

describe('a stockroom run by Colophon: the words the code writes', () => {
  it('no new technical sentence appears, and the known ones only go', () => {
    const found = technicalSentences();
    if (process.env.UPDATE_PLAIN_WORDS) {
      writeFileSync(KNOWN, `${JSON.stringify([...found.keys()].sort(), null, 1)}\n`);
      return;
    }
    const known = new Set(JSON.parse(readFileSync(KNOWN, 'utf8')));
    const added = [...found].filter(([key]) => !known.has(key)).map(([key, at]) => `${at} ${key}`);
    const gone = [...known].filter((key) => !found.has(key));
    expect(added, 'new technical words: reword them, or add the marker comment “Own-account shops only” if only a shop on its own accounts can reach them').toEqual([]);
    expect(gone, 'listed sentences that are gone: run UPDATE_PLAIN_WORDS=1 npx vitest run tests/platformPlainWords.test.js to shorten the list').toEqual([]);
  });

  it('the reader finds sentences and leaves code strings alone', () => {
    const source = [
      "const a = 'Add your Stripe key first';",
      "const b = `Saved <b data-key=\"${id}\">${name}</b> to your books`;",
      "const c = 'root-folder'; const d = 'click';",
      "console.warn('Could not read the key');",
      "const e = 'Paste the key here'; // Own-account shops only: shown to a press on its own accounts",
    ].join('\n');
    const read = sentencesIn(source);
    expect(read.map((s) => s.text)).toEqual(['Add your Stripe key first', 'Saved § to your books', 'Paste the key here']);
    expect(read.map((s) => s.marked)).toEqual([false, false, true]);
    expect(read.map((s) => banned(s.text).length > 0)).toEqual([true, false, true]);
  });
});
