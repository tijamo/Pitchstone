import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The version in package.json is the single source of truth; the status bar
// reads it through this define rather than pulling package.json into the bundle.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // A production build on Netlify with no Supabase keys would deploy an app
  // that cannot reach its own vault — and would do it quietly, since a missing
  // env var is not a compile error. Fail the build instead, so the previous
  // deploy stays published and the problem is visible in the deploy log.
  if (command === 'build' && process.env.NETLIFY) {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
      (key) => !env[key] && !process.env[key],
    )
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable(s): ${missing.join(', ')}. ` +
          'Set them in the Netlify dashboard under Project configuration → ' +
          'Environment variables, then redeploy.',
      )
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        // Every push to main deploys, so a worker that waited for every tab to
        // close would strand people on an old bundle for days. But a plain
        // autoUpdate reloads the page the moment the new worker lands, which
        // in a notes app can happen mid-sentence — so the update is taken
        // promptly and manually, in main.tsx, after the pending write is
        // flushed. Hence 'prompt' plus registering by hand.
        registerType: 'prompt',
        injectRegister: false,
        // Neither includeAssets nor includeManifestIcons: the globPatterns
        // below already sweep up everything copied out of public/, and each of
        // those options would list the icons a second time — precaching the
        // same bytes twice under two revisions.
        includeManifestIcons: false,
        manifest: {
          name: 'Pitchstone',
          short_name: 'Pitchstone',
          description:
            'A light Obsidian: connected markdown notes in a three-pane vault.',
          id: '/',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          // Matches --bg-sidebar, so the splash screen and the app shell are
          // the same colour and installing does not flash.
          background_color: '#17171b',
          theme_color: '#17171b',
          categories: ['productivity', 'utilities'],
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // The app shell only. The vault lives in Supabase and is deliberately
          // never cached: a notes app that quietly served yesterday's text, and
          // accepted edits it could not save, would be worse than one that says
          // it is offline.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/mcp/],
          cleanupOutdatedCaches: true,
          // The editor chunk alone is over half a megabyte.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  }
})
