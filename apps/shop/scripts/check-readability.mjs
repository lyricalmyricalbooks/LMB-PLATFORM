#!/usr/bin/env node
/*
 * Readability audit for the admin dashboard's light mode.
 *
 * The admin uses a dark-first design and flips to light via the `.admin-light`
 * class, whose overrides live in `src/styles/adminCompat.css`. The recurring failure
 * mode is faint white text — utilities like `text-white/30` — which renders as
 * (near-)white-on-white in light mode and disappears unless adminCompat.css remaps it.
 *
 * This script scans the admin source for those faint-white text utilities and
 * flags any that lack a matching `.admin-light` override in adminCompat.css. Run it
 * with `npm run check:readability`. Exit code 1 means there are unreadable
 * utilities to fix; 0 means light mode is covered.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const adminDir = path.join(rootDir, 'src', 'app', 'admin');
const themeCssPath = path.join(rootDir, 'src', 'styles', 'adminCompat.css');

// Opacity at/below this is dark-mode "muted" text that vanishes on white.
// Anything in this range MUST have an `.admin-light` override to stay legible.
const FAINT_WHITE = /\btext-white\/(\d{1,3})\b/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|jsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

// Collect the opacity steps that adminCompat.css already overrides under .admin-light.
function coveredOpacities() {
  const css = readFileSync(themeCssPath, 'utf8');
  const covered = new Set();
  const re = /\.admin-light\s+\.text-white\\\/(\d{1,3})\b/g;
  let m;
  while ((m = re.exec(css)) !== null) covered.add(m[1]);
  return covered;
}

const covered = coveredOpacities();
const findings = [];

for (const file of walk(adminDir)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    let m;
    FAINT_WHITE.lastIndex = 0;
    while ((m = FAINT_WHITE.exec(line)) !== null) {
      const opacity = m[1];
      if (!covered.has(opacity)) {
        findings.push({
          file: path.relative(rootDir, file),
          line: i + 1,
          token: m[0],
        });
      }
    }
  });
}

console.log('====================================================');
console.log('READABILITY AUDIT: admin light-mode contrast');
console.log('====================================================');

if (findings.length === 0) {
  console.log('✅ PASS: every faint-white text utility used in the admin has');
  console.log('   a matching .admin-light override in src/styles/adminCompat.css.');
  process.exit(0);
}

console.error(`❌ FAIL: ${findings.length} faint-white text utility usage(s) have no`);
console.error('   .admin-light override and will be unreadable in light mode.\n');
for (const f of findings) {
  console.error(`   ${f.file}:${f.line}  ${f.token}`);
}
console.error('\n   Fix: add a `.admin-light .text-white\\/<n>` rule in');
console.error('   src/styles/adminCompat.css mapping it to a readable slate color.');
process.exit(1);
