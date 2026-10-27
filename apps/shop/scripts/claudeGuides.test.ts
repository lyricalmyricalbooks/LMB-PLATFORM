import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The root CLAUDE.md is read by every session, so it stays a short index; each area's notes live in the CLAUDE.md
// next to its code (loaded only when work happens there). New notes go in the area guide, not the root.
const root = join(__dirname, '..');
const guide = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const index = guide.slice(guide.indexOf('## Where the rest lives'), guide.indexOf('## Commands'));

describe('agent guides', () => {
  it('keeps the root guide under its size budget', () => {
    expect(guide.length, 'Move area notes into that folder\'s CLAUDE.md').toBeLessThan(32_000);
  });
  it('lists only area guides that exist, and every one that does', () => {
    const listed = [...index.matchAll(/^- \*\*`([^`]+CLAUDE\.md)`\*\*/gm)].map(m => m[1]);
    expect(listed.length).toBeGreaterThan(0);
    for (const path of listed) expect(existsSync(join(root, path)), path).toBe(true);
    for (const path of ['functions/CLAUDE.md', 'src/app/admin/CLAUDE.md', 'src/app/admin/studio/CLAUDE.md',
      'src/app/features/site/CLAUDE.md', '.github/CLAUDE.md']) expect(listed).toContain(path);
  });
  it('points at guides that exist from the cross-cutting rules', () => {
    for (const [, path] of index.matchAll(/`((?:\.github|functions|src)\/[^`]*CLAUDE\.md)`/g)) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
  });
});
