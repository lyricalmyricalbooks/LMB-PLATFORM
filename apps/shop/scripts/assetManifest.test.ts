import { describe, expect, it } from 'vitest';
import { assetNames, parseAssetManifest, safeAssetName, isFingerprint, isHtmlResponse } from './assetManifest.mjs';

describe('asset manifest (keeps the previous deploy styles reachable)', () => {
  it('accepts hashed Vite asset names', () => {
    expect(safeAssetName('index-Dx1LnaHn.css')).toBe(true);
    expect(safeAssetName('MainSite-JEsNvdMP.js')).toBe(true);
  });

  it('refuses paths and traversal', () => {
    for (const bad of ['../index.html', 'a/b.js', '..', '.hidden', '', 'x\\y.js', 'a..b.js']) expect(safeAssetName(bad)).toBe(false);
  });

  it('parses a published list, dropping blanks, duplicates and unsafe lines', () => {
    expect(parseAssetManifest('b.js\n\na.css\r\nb.js\n../../etc/passwd\n<html>\n')).toEqual(['a.css', 'b.js']);
    expect(parseAssetManifest(undefined)).toEqual([]);
  });

  it('sorts its own list', () => {
    expect(assetNames(['z.js', 'a.css'])).toEqual(['a.css', 'z.js']);
  });
});

describe('live-site files read back by the deploy (never mistake an HTML page for them)', () => {
  it('accepts only a SHA-256 hex digest as the published-content marker', () => {
    expect(isFingerprint('a'.repeat(64))).toBe(true);
    expect(isFingerprint(`${'0f'.repeat(32)}\n`)).toBe(true);
    for (const bad of ['', '<!DOCTYPE html><html>', 'A'.repeat(64), 'a'.repeat(63), undefined]) expect(isFingerprint(bad)).toBe(false);
  });

  it('spots an HTML answer where a script, stylesheet or list was expected', () => {
    expect(isHtmlResponse('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlResponse('TEXT/HTML')).toBe(true);
    for (const ok of ['text/javascript', 'text/css; charset=utf-8', 'text/plain', null]) expect(isHtmlResponse(ok)).toBe(false);
  });
});
