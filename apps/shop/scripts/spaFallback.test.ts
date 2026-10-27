import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseSegments, withBaseSegments, fallbackFiles, fallbackMode } from './spaFallback.mjs';

const page = readFileSync(join(__dirname, '..', 'public', '404.html'), 'utf8');

describe('404.html SPA fallback follows the site base', () => {
  it('counts the base folders', () => {
    expect(baseSegments('/LyricalmyricalWebsite/')).toBe(1);
    expect(baseSegments('/')).toBe(0);
    expect(baseSegments('/a/b/')).toBe(2);
  });

  it('rewrites the shipped page for the repository folder and for a custom domain', () => {
    expect(withBaseSegments(page, '/LyricalmyricalWebsite/')).toMatch(/var pathSegmentsToKeep = 1;/);
    expect(withBaseSegments(page, '/')).toMatch(/var pathSegmentsToKeep = 0;/);
  });

  it('refuses a page without the line rather than shipping a wrong redirect', () => {
    expect(() => withBaseSegments('<html></html>', '/')).toThrow();
  });
});

describe('fallback files for each host (SPA_FALLBACK)', () => {
  const indexHtml = '<!doctype html><div id="root"></div>';

  it('always keeps the clean app shell as spa.html (Firebase Hosting rewrites app routes to it)', () => {
    expect(fallbackFiles({ indexHtml, page404: page, base: '/LyricalmyricalWebsite/', mode: 'redirect' })['spa.html']).toBe(indexHtml);
    expect(fallbackFiles({ indexHtml, page404: page, base: '/', mode: 'shell' })['spa.html']).toBe(indexHtml);
  });

  it('Firebase Hosting (default) gets the app shell as 404.html: a real 404 status that still renders the missing page', () => {
    expect(fallbackFiles({ indexHtml, page404: page, base: '/' })['404.html']).toBe(indexHtml);
    expect(fallbackFiles({ indexHtml, page404: null, base: '/', mode: 'shell' })['404.html']).toBe(indexHtml);
  });

  it('the old GitHub Pages redirect is still available until the cleanup step', () => {
    const files = fallbackFiles({ indexHtml, page404: page, base: '/LyricalmyricalWebsite/', mode: 'redirect' });
    expect(files['404.html']).toMatch(/var pathSegmentsToKeep = 1;/);
  });

  it('refuses a mistyped mode instead of shipping the wrong 404 page', () => {
    expect(fallbackMode(undefined)).toBe('shell');
    expect(fallbackMode('')).toBe('shell');
    expect(fallbackMode('redirect')).toBe('redirect');
    expect(() => fallbackMode('shel')).toThrow();
  });
});
