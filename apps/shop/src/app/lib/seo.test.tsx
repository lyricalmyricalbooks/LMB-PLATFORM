// @vitest-environment jsdom
import { act } from 'react';
import { BrowserRouter, MemoryRouter, useNavigate } from 'react-router';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { setSiteIdentity, useSEO } from './seo';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('sets exact custom titles, canonical URLs, clears stale social images, and restores indexability', () => {
  const root = createRoot(document.createElement('div'));
  function Page(props: any) { useSEO(props); return null; }
  setSiteIdentity({ copy: { siteTitleFormat: '{title} | Press' } });
  act(() => root.render(<MemoryRouter><Page title="Custom search title" exactTitle url="https://example.com/shop/books/one?utm_source=x" image="https://example.com/one.jpg" noindex /></MemoryRouter>));
  expect(document.title).toBe('Custom search title');
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.com/shop/books/one');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  act(() => root.render(<MemoryRouter><Page title="Next" url="https://example.com/shop/" /></MemoryRouter>));
  expect(document.querySelector('meta[property="og:image"]')).toBeNull();
  expect(document.querySelector('meta[name="twitter:image"]')).toBeNull();
  expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow, max-image-preview:large');
  act(() => root.unmount());
});

it('updates canonical and preview robots when reused page SEO props stay the same across navigation', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  window.history.replaceState(null, '', '/collections/first');
  function Collection() {
    const navigate = useNavigate();
    useSEO({ title: 'Archive' });
    return <button onClick={() => navigate('/collections/second?preview=true')}>Next category</button>;
  }
  act(() => root.render(<BrowserRouter><Collection /></BrowserRouter>));
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/collections/first');
  act(() => container.querySelector('button')!.click());
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/collections/second');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  act(() => root.unmount());
});

it('marks private account pages noindex even when page SEO only supplies a title', () => {
  const root = createRoot(document.createElement('div'));
  function Account() { useSEO({ title: 'Account' }); return null; }
  act(() => root.render(<MemoryRouter initialEntries={['/account/orders']}><Account /></MemoryRouter>));
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  act(() => root.unmount());
});

it('publishes and removes the owner supplied Search Console verification token', () => {
 const root = createRoot(document.createElement('div'));
 function Page() { useSEO({ title: 'Home' }); return null; }
 setSiteIdentity({ copy: { googleSiteVerification: 'public-verification-token' } });
 act(() => root.render(<MemoryRouter><Page /></MemoryRouter>));
 expect(document.querySelector('meta[name="google-site-verification"]')?.getAttribute('content')).toBe('public-verification-token');
 act(() => setSiteIdentity({ copy: { googleSiteVerification: '' } }));
 expect(document.querySelector('meta[name="google-site-verification"]')).toBeNull();
 act(() => root.unmount());
});

it('describes the share image, publishes product price tags and drops the static shop markup', () => {
  const root = createRoot(document.createElement('div'));
  const stale = document.createElement('script');
  stale.id = 'seo-jsonld-static';
  stale.type = 'application/ld+json';
  document.head.appendChild(stale);
  function Page(props: any) { useSEO(props); return null; }
  setSiteIdentity({ copy: {} });
  act(() => root.render(<MemoryRouter><Page title="Photo book" exactTitle image="https://example.com/cover.jpg" product={{ price: 24, currency: 'CAD', availability: 'in stock' }} /></MemoryRouter>));
  expect(document.getElementById('seo-jsonld-static')).toBeNull();
  expect(document.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toBe('Photo book');
  expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
  expect(document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content')).toBe('24.00');
  expect(document.querySelector('meta[property="product:price:currency"]')?.getAttribute('content')).toBe('CAD');
  expect(document.querySelector('meta[property="product:availability"]')?.getAttribute('content')).toBe('in stock');
  act(() => root.render(<MemoryRouter><Page title="About" /></MemoryRouter>));
  expect(document.querySelector('meta[property="product:price:amount"]')).toBeNull();
  expect(document.querySelector('meta[property="product:availability"]')).toBeNull();
  act(() => root.unmount());
});
