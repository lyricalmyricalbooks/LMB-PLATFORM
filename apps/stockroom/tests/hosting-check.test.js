// @vitest-environment node
// The stockroom's Hosting settings (plan 1.20) against what a build writes (scripts/hostingCheck.mjs). CI also runs the
// check on the real build (`npm run check:hosting` after `npm run build`).
import { describe, expect, it } from 'vitest';
import template from '../firebase.json';
import { cacheControlFor, hostingProblems } from '../scripts/hostingCheck.mjs';

describe('Hosting settings', () => {
  const built = ['index.html', 'admin/index.html', 'sw.js', 'sw-notify.js', 'shop-profile.js', 'manifest.webmanifest', 'gas-code.txt',
    'workbox-294346ee.js', 'assets/index-KHmv6-DT.js', 'assets/index-CIyDaQZK.css', 'favicon.ico', 'logo.png'];

  it('fit what a build writes: the page, worker and profile are never cached; hashed assets are kept', () => {
    expect(hostingProblems(template.hosting, built)).toEqual([]);
    for (const path of ['/', '/index.html', '/admin/', '/sw.js', '/shop-profile.js']) expect(cacheControlFor(template.hosting, path), path).toBe('no-cache');
    expect(cacheControlFor(template.hosting, '/assets/index-KHmv6-DT.js')).toMatch(/immutable/);
  });

  it('catch a build the settings would serve stale or not at all', () => {
    expect(hostingProblems({ ...template.hosting, public: 'build' }, built)).toContain('Hosting serves "build", not the build folder "dist"');
    expect(hostingProblems(template.hosting, built.filter((f) => f !== 'shop-profile.js'))).toContain('the build has no shop-profile.js');
    const noFresh = { ...template.hosting, headers: template.hosting.headers.filter((h) => !/no-cache/.test(JSON.stringify(h))) };
    expect(hostingProblems(noFresh, built).some((p) => p.startsWith('/sw.js must be sent with no-cache'))).toBe(true);
    const keepAll = { ...template.hosting, headers: [{ regex: '^/.*$', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }] };
    expect(hostingProblems(keepAll, built)).toContain('/logo.png is cached for good but its name has no content hash');
  });
});
