import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A React hook below an early `if (…) return` runs on some renders and not others, which throws
// "Rendered more hooks than during the previous render" and blanks the whole screen. That took down
// Settings › Notifications and Email sender (October 2026). This scan finds the plain pattern: a
// two-space-indented `if (…) return` in a top-level component followed later by a hook call at the same indent.
const root = join(__dirname, '..', '..');
const COMPONENT = /^(export )?(default )?function [A-Z]\w*\s*\(|^(export )?const [A-Z]\w*\s*=\s*(\(|React\.memo|memo|forwardRef)/;
const EARLY_RETURN = /^  if \(.*\) return\b/;
const HOOK = /^  (const|let) .*=\s*use[A-Z]\w*\(|^  use[A-Z]\w*\(/;

export function hooksAfterEarlyReturn(source: string): number[] {
  const lines = source.split('\n');
  const found: number[] = [];
  let inComponent = false;
  let returned = false;
  lines.forEach((line, i) => {
    if (COMPONENT.test(line)) { inComponent = true; returned = false; return; }
    if (!inComponent) return;
    if (line.startsWith('}')) { inComponent = false; return; }
    if (EARLY_RETURN.test(line)) returned = true;
    else if (returned && HOOK.test(line)) found.push(i + 1);
  });
  return found;
}

describe('no React hook after an early return', () => {
  it('spots the pattern', () => {
    expect(hooksAfterEarlyReturn('export function A() {\n  const [x] = useState(1);\n  if (x) return null;\n  useEffect(() => {}, []);\n  return null;\n}')).toEqual([4]);
    expect(hooksAfterEarlyReturn('export function A() {\n  useEffect(() => {}, []);\n  if (x) return null;\n  return null;\n}')).toEqual([]);
  });

  it('holds for every component in src/', () => {
    const files = globSync('src/**/*.tsx', { cwd: root }).filter(f => !f.includes('.test.'));
    const bad = files.flatMap(f => hooksAfterEarlyReturn(readFileSync(join(root, f), 'utf8')).map(line => `${f}:${line}`));
    expect(bad).toEqual([]);
  });
});
