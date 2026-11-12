import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { paypalCredentials, paypalWebhookId } = createRequire(import.meta.url)('./paypalCredentials');

const fallback = { clientId: 'live-fn-id', clientSecret: 'live-fn-secret' };

test('test mode uses the saved sandbox pair and never the live Functions secrets', () => {
  const out = paypalCredentials({ testMode: true, settingsPaypal: { testClientId: ' sb-id ' }, privateSecrets: { testClientSecret: 'sb-secret' }, fallback });
  expect(out).toMatchObject({ ok: true, clientId: 'sb-id', clientSecret: 'sb-secret', source: 'test' });
});

test('test mode with a missing half says so instead of sending live credentials to the sandbox', () => {
  const noSecret = paypalCredentials({ testMode: true, settingsPaypal: { testClientId: 'sb-id' }, privateSecrets: {}, fallback });
  expect(noSecret.ok).toBe(false);
  expect(noSecret.error).toMatch(/Test client ID and Test client secret/);
  expect(paypalCredentials({ testMode: true, settingsPaypal: {}, privateSecrets: { testClientSecret: 's' }, fallback }).ok).toBe(false);
});

test('live mode uses the saved pair only when both halves are saved, otherwise the Functions secrets', () => {
  expect(paypalCredentials({ testMode: false, settingsPaypal: { clientId: 'id' }, privateSecrets: { clientSecret: 'sec' }, fallback }))
    .toMatchObject({ ok: true, clientId: 'id', clientSecret: 'sec', source: 'settings' });
  expect(paypalCredentials({ testMode: false, settingsPaypal: { clientId: 'typo-id' }, privateSecrets: {}, fallback }))
    .toMatchObject({ ok: true, clientId: 'live-fn-id', clientSecret: 'live-fn-secret', source: 'functions' });
});

test('live mode with nothing configured is refused', () => {
  expect(paypalCredentials({ testMode: false, settingsPaypal: {}, privateSecrets: {}, fallback: { clientId: '', clientSecret: '' } }).ok).toBe(false);
});

test("PayPal notices are checked against the shop's own saved id, never another shop's", () => {
  expect(paypalWebhookId({ testMode: false, settingsPaypal: { webhookId: ' WH-1 ' }, fallback: 'WH-server' })).toBe('WH-1');
  expect(paypalWebhookId({ testMode: false, settingsPaypal: {}, fallback: 'WH-server' })).toBe('WH-server');
  // The shared server has no server-wide id, so a shop that saved none has none.
  expect(paypalWebhookId({ testMode: false, settingsPaypal: {}, fallback: '' })).toBe('');
  expect(paypalWebhookId({ testMode: true, settingsPaypal: { webhookId: 'WH-1', testWebhookId: 'WH-test' }, fallback: 'WH-server' })).toBe('WH-test');
  expect(paypalWebhookId({ testMode: true, settingsPaypal: { webhookId: 'WH-1' }, fallback: 'WH-server' })).toBe('');
});
