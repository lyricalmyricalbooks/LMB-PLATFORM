// The designer before a store exists (src/designFirst), for the platform site's /design/. Two pages: design.html, the
// real Studio (served at /design/studio), and design-shop.html, the shop's pages Studio previews (every other /design/
// address). None of the storefront's build steps (prerender, sitemap, the canonical address) apply: nothing here is a
// real shop.
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/design/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src'), '@stockroom': path.resolve(import.meta.dirname, '../stockroom/src/lib') } },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  // The shop's own public files (its profile, robots, sitemap, admin worker) belong to a real shop, never here.
  publicDir: false,
  build: {
    outDir: 'dist-design',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        design: path.resolve(import.meta.dirname, 'design.html'),
        shop: path.resolve(import.meta.dirname, 'design-shop.html'),
      },
    },
  },
})
