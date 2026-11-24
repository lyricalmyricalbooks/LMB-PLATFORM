// The live demo shops (src/demoShop), for the platform site's /demo/: every starter as a sample shop anyone can click
// around before signing up. One page, demo.html. None of the storefront's build steps (prerender, sitemap, the canonical
// address) apply, and the shop's own public files (its profile, robots, admin worker) belong to a real shop, so only the
// starters' pictures and the sample products' photos are copied in.
import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import { cpSync } from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const OUT = 'dist-demo'
/** The public folders a sample shop shows: the starters' pictures and the sample sets' photos. */
export const DEMO_PUBLIC = ['starters', 'samples']

function samplePictures(): Plugin {
  return {
    name: 'demo-sample-pictures',
    apply: 'build',
    closeBundle() {
      for (const folder of DEMO_PUBLIC) cpSync(path.resolve(import.meta.dirname, 'public', folder), path.resolve(import.meta.dirname, OUT, folder), { recursive: true })
    },
  }
}

export default defineConfig({
  base: '/demo/',
  plugins: [react(), tailwindcss(), samplePictures()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src'), '@stockroom': path.resolve(import.meta.dirname, '../stockroom/src/lib'), '@help': path.resolve(import.meta.dirname, '../../help') } },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  publicDir: false,
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: { demo: path.resolve(import.meta.dirname, 'demo.html') } },
  },
})
