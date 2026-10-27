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
