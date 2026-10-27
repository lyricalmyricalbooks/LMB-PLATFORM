import { describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PLACEHOLDER, readShopConfig } = require('./shopConfig');

describe('readShopConfig', () => {
  test('a shop with its own values', () => {
    const config = readShopConfig({
      SHOP_OWNER_EMAIL: ' Hello@Moth.example ',
      SHOP_SENDER_NAME: 'Moth Press',
      SHOP_SENDER_EMAIL: 'orders@moth.example',
      SHOP_SITE_URL: 'https://mothpress.example/',
      SHOP_EXTRA_ORIGINS: 'https://old.mothpress.example, not a url',
      GCLOUD_PROJECT: 'moth-press-shop',
    });
    expect(config.ownerEmail).toBe('hello@moth.example');
    expect(config.senderName).toBe('Moth Press');
    expect(config.senderEmail).toBe('orders@moth.example');
    expect(config.siteUrl).toBe('https://mothpress.example');
    expect(config.siteHost).toBe('mothpress.example');
    expect(config.allowedOrigins).toEqual([
      'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000',
      'https://old.mothpress.example', 'https://moth-press-shop.web.app',
      'https://mothpress.example', 'https://www.mothpress.example',
    ]);
  });

  test('nothing set keeps the placeholders, so tests and the emulator run as before', () => {
    const config = readShopConfig({});
    expect(config.ownerEmail).toBe(PLACEHOLDER.ownerEmail);
    expect(config.senderEmail).toBe(PLACEHOLDER.senderEmail);
    expect(config.siteUrl).toBe(PLACEHOLDER.siteUrl);
    expect(config.allowedOrigins).toContain('https://yourpress.github.io');
    expect(config.allowedOrigins).toContain('https://lmb-test-shop.web.app');
  });

  test('a malformed value falls back on its own, never taking the others with it', () => {
    const config = readShopConfig({
      SHOP_OWNER_EMAIL: 'owner at moth',
      SHOP_SENDER_NAME: 'Moth "Press"\r\nBcc: x',
      SHOP_SENDER_EMAIL: 'orders@moth.example',
      SHOP_SITE_URL: 'http://mothpress.example',
    });
    expect(config.ownerEmail).toBe(PLACEHOLDER.ownerEmail);
    expect(config.senderName).not.toMatch(/[\r\n"<>]/);
    expect(config.senderEmail).toBe('orders@moth.example');
    expect(config.siteUrl).toBe(PLACEHOLDER.siteUrl);
  });

  test('a www site address does not add a www.www twin', () => {
    const config = readShopConfig({ SHOP_SITE_URL: 'https://www.mothpress.example', SHOP_EXTRA_ORIGINS: '' });
    expect(config.siteHost).toBe('mothpress.example');
    expect(config.allowedOrigins.filter(o => o.includes('www.'))).toEqual(['https://www.mothpress.example']);
  });

  test('function links follow the shop\'s region and project', () => {
    const { functionLink } = require('./shopConfig');
    const moth = readShopConfig({ SHOP_FUNCTIONS_REGION: 'northamerica-northeast1', GCLOUD_PROJECT: 'moth-press-shop' });
    expect(moth.region).toBe('northamerica-northeast1');
    expect(functionLink(moth, 'stripeWebhook')).toBe('https://northamerica-northeast1-moth-press-shop.cloudfunctions.net/stripeWebhook');
    // Unset or malformed keeps today's region for the test shop.
    expect(functionLink(readShopConfig({}), 'downloadDigitalAsset')).toBe('https://us-central1-lmb-test-shop.cloudfunctions.net/downloadDigitalAsset');
    expect(readShopConfig({ SHOP_FUNCTIONS_REGION: 'Mars/../x' }).region).toBe(PLACEHOLDER.region);
  });

  test('no function link is written out by hand anywhere in the server code', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const here = new URL('.', import.meta.url);
    for (const file of readdirSync(here).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))) {
      expect(readFileSync(new URL(file, here), 'utf8'), file).not.toMatch(/https:\/\/[a-z0-9-]+\.cloudfunctions\.net/);
    }
  });

  test('only SHOP_TEST_SHOP="true" marks the platform test shop; anything else is a normal shop', () => {
    expect(readShopConfig({}).testShop).toBe(false);
    expect(PLACEHOLDER.testShop).toBe(false);
    expect(readShopConfig({ SHOP_TEST_SHOP: 'true' }).testShop).toBe(true);
    expect(readShopConfig({ SHOP_TEST_SHOP: ' TRUE ' }).testShop).toBe(true);
    for (const value of ['', 'false', '1', 'yes', 'truee']) expect(readShopConfig({ SHOP_TEST_SHOP: value }).testShop).toBe(false);
  });

  test('the result cannot be changed by a caller', () => {
    const config = readShopConfig({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.allowedOrigins)).toBe(true);
  });
});
