import { describe, it, expect } from 'vitest';
import page from '../index.html?raw';

// The build moves the app's script into <head>, and deferred scripts run in page order. A shop profile placed after it
// ran too late: the stockroom fell back to the built-in test project and nobody could sign in (10 November 2026).
describe('the shop profile loads before the app', () => {
  it('sits in the head, before the app script', () => {
    const head = page.slice(0, page.indexOf('</head>'));
    const profile = page.indexOf('shop-profile.js"></script>');
    const app = page.indexOf('src="/src/main.js"');
    expect(head).toContain('shop-profile.js"></script>');
    expect(profile).toBeGreaterThan(-1);
    expect(profile).toBeLessThan(app);
    expect(page.match(/shop-profile\.js"><\/script>/g)).toHaveLength(1);
  });
});
