// Setup mode's build (code plan 18.6): setup.html only, for the platform site's /app/. None of the storefront's build
// steps (prerender, sitemap, fallback pages) apply: this page is the admin before a shop exists.
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src'), '@stockroom': path.resolve(import.meta.dirname, '../stockroom/src/lib') } },
  build: {
    outDir: 'dist-setup',
    emptyOutDir: true,
    rollupOptions: { input: { setup: path.resolve(import.meta.dirname, 'setup.html') } },
  },
})
