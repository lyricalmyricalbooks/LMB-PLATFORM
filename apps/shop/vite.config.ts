/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fallbackFiles } from './scripts/spaFallback.mjs'
import { canonicalHostScript, stampSiteAddress } from './scripts/canonicalHost.mjs'
import { shopSiteUrlSync } from './scripts/shopProfile.mjs'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(import.meta.dirname, 'src/assets', filename)
      }
    },
  }
}

// Runs while dist/index.html is still the clean app shell (the prerender replaces it with the home page later):
// writes spa.html (Firebase Hosting serves it for app routes without a prerendered page) and 404.html — the app
// shell itself, or with SPA_FALLBACK=redirect the old GitHub Pages redirect (see scripts/spaFallback.mjs).
function spaFallbackBase(base: string) {
  let outDir = 'dist'
  return {
    name: 'spa-fallback-base',
    apply: 'build' as const,
    configResolved(config: { build: { outDir: string } }) { outDir = path.resolve(import.meta.dirname, config.build.outDir) },
    writeBundle() {
      const page404 = path.join(outDir, '404.html')
      const files = fallbackFiles({
        indexHtml: readFileSync(path.join(outDir, 'index.html'), 'utf8'),
        page404: existsSync(page404) ? readFileSync(page404, 'utf8') : null,
        base,
        mode: process.env.SPA_FALLBACK,
      })
      for (const [name, html] of Object.entries(files)) writeFileSync(path.join(outDir, name), html)
    },
  }
}

// Sends visitors on the project's default Firebase Hosting addresses (and the www/bare twin of the shop's own
// domain) to SITE_URL, and names SITE_URL in index.html's built-in links (scripts/canonicalHost.mjs).
// Inert unless SITE_URL is a site at the root of its host.
function canonicalHost() {
  const siteUrl = shopSiteUrlSync() // SITE_URL, else the shop profile's siteUrl
  return {
    name: 'canonical-host',
    apply: 'build' as const,
    // Right after <meta charset> (which must stay in the first 1024 bytes), before anything starts loading.
    transformIndexHtml(html: string) {
      if (!/<meta charset[^>]*>/i.test(html)) throw new Error('index.html has no <meta charset> to place the canonical-host script after')
      const stamped = stampSiteAddress(html, siteUrl) // og:url and the no-JS JSON-LD name SITE_URL, not the default
      return stamped.replace(/<meta charset[^>]*>/i, tag => `${tag}\n    <script>${canonicalHostScript(siteUrl)}</script>`)
    },
  }
}

// The header and footer are in every shop page, but their code sits behind lazy page chunks, so the browser only asks
// for it after the entry script has run. Naming StoreHeader's chunk (and the chunks it imports, minus the entry) in
// index.html lets it download beside the entry. Page chunks (MainSite, BookDetail…) stay out: they differ per route.
function preloadShopChrome() {
  return {
    name: 'preload-shop-chrome',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, any> }) {
        const bundle = ctx.bundle
        if (!bundle) return
        const chunks = Object.values(bundle).filter((c: any) => c.type === 'chunk')
        // Found by the module it holds, not its name: Rolldown names a shared chunk after another of its modules.
        const header: any = chunks.find((c: any) => (c.moduleIds || Object.keys(c.modules || {})).some((id: string) => /[\\/]features[\\/]site[\\/]StoreHeader\.tsx$/.test(id)))
        if (!header) return
        const entries = new Set(chunks.filter((c: any) => c.isEntry).map((c: any) => c.fileName))
        const seen = new Set<string>()
        const walk = (name: string) => {
          if (seen.has(name) || entries.has(name)) return
          seen.add(name)
          for (const dep of bundle[name]?.imports || []) walk(dep)
        }
        walk(header.fileName)
        // The Firebase SDK chunks load on first use, after the shop data is asked for; keep them out of the early set.
        const files = [...seen].filter(f => !/(^|\/)(firebase|index\.esm|firestoreLite|firebaseApp|bloom_blob)/.test(f))
          // Vite already preloads the entry's own static imports; name each file once.
          .filter(f => !html.includes(`/${f}"`))
        return files.map(f => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: '', href: SITE_BASE.replace(/\/?$/, '/') + f },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

// Firebase Hosting serves the shop from the root of its address (dev too). SITE_BASE can still be overridden
// for a sub-path deploy; the old GitHub Pages folder (/shop/) now only forwards visitors.
const SITE_BASE = process.env.SITE_BASE ?? '/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? SITE_BASE : '/',
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
    spaFallbackBase(SITE_BASE),
    canonicalHost(),
    preloadShopChrome(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  test: {
    // Vitest 5 caches transformed files on disk by default, and the cache doesn't notice a new file joining an
    // import.meta.glob (e.g. a new release note in admin/updates), so tests would read a stale list.
    fsModuleCache: false,
    // On a slow machine (the Windows CI job) a test file can finish while one of its console lines is still on its
    // way to the main process; Vitest then reports "Closing rpc while onUserConsoleLog was pending" as an error even
    // though every test passed. Only that lost log line is ignored; any other unhandled error still fails the run.
    onUnhandledError: (error) =>
      !(error?.name === "EnvironmentTeardownError" && /"onUserConsoleLog" was pending/.test(String(error?.message))),
  },
}))
