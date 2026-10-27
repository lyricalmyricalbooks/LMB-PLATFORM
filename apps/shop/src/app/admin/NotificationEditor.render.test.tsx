// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  notifications: null as any,
  website: null as any,
  logs: [] as any[],
  publicSettings: {} as any,
}));
vi.mock('../../lib/firebase', () => ({ db: {}, auth: { currentUser: { email: 'lyricalmyricalbooks@gmail.com' } } }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, col: string, id: string) => ({ col, id }),
  collection: (_db: any, col: string) => ({ col }),
  query: (c: any) => c, orderBy: () => ({}), limit: () => ({}),
  getDoc: async (ref: any) => {
    const data = ref.id === 'notifications' ? m.notifications : ref.id === 'website' ? m.website : null;
    return { exists: () => data != null, data: () => data };
  },
  getDocs: async () => ({ docs: m.logs.map((d, i) => ({ id: String(i), data: () => d })) }),
  setDoc: async () => {},
}));
vi.mock('./api', () => ({
  adminApi: {
    getPublicSettings: async () => m.publicSettings,
    getPrivateKeyFlags: async () => ({ resend: false, resendMigrated: false, gmail: false }),
    saveNotificationSettings: async () => {}, markKeysMigrated: async () => {},
    getRecentFulfillmentOrders: async () => [], getAllOrders: async () => [],
  },
}));
vi.mock('./notificationApi', async (orig) => ({ ...(await orig() as any), emailFunction: async () => ({ entries: [] }) }));
import { NotificationEditor } from './NotificationEditor';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); m.notifications = null; m.website = null; m.logs = []; m.publicSettings = {}; });

async function renderEditor(focus?: 'sender') {
  const errors: any[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
  const root = createRoot(container);
  await act(async () => { root.render(<NotificationEditor focus={focus} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  spy.mockRestore();
  return { root, errors };
}

const cases: [string, () => void][] = [
  ['nothing saved yet', () => {}],
  ['saved settings with sender and shop alerts', () => {
    m.notifications = { brand: { logoUrl: '', brandColor: '#ff0000' }, shopAlerts: { newOrder: true, shipped: false, dailyOrderDigest: true }, order_confirmation: { subject: 'Hi', body: 'x' } };
    m.publicSettings = { communications: { fromName: 'Lyricalmyrical', replyTo: 'a@b.co', fromEmail: 'onboarding@resend.dev' } };
    m.logs = [{ at: '2026-10-10T10:00:00Z', to: 'x@y.co', subject: 's', status: 'sent' }, { at: { seconds: 1 }, to: null, status: 'failed', error: null }];
  }],
  ['odd stored shapes (null templates, communications not an object)', () => {
    m.notifications = { brand: null, order_confirmation: null, shopAlerts: null, review_request: { enabled: 'yes', delayDays: '14' } };
    m.publicSettings = { communications: 'old string value' };
  }],
];

for (const [name, setup] of cases) {
  for (const focus of [undefined, 'sender'] as const) {
    it(`opens (${focus ? 'Email sender' : 'Notifications'}) — ${name}`, async () => {
      setup();
      const { root, errors } = await renderEditor(focus);
      const crash = errors.find(e => String(e[0]).includes('The above error') || e.some((x: any) => x instanceof Error));
      expect(crash ? String(crash.find((x: any) => x instanceof Error)?.stack || crash[0]) : '').toBe('');
      expect(container.textContent?.length).toBeGreaterThan(50);
      await act(async () => root.unmount());
    });
  }
}
