---
name: verify
description: Build, launch, and drive Pitchstone locally to confirm a change actually works in the app. Use when asked to run the app, screenshot it, or verify a change end to end rather than only by reading code.
---

# Verifying Pitchstone

Pitchstone is a Vite + React + TypeScript SPA deployed to Netlify. Once the MCP
server lands (Phase 6) there are also Netlify Functions, which Vite's own dev
server does not run — see "With functions" below.

## First: write a `.env.local`

Do this before building anything you intend to *look at*. Without it the app
renders "Pitchstone isn't configured" instead of the sign-in form, and Vite
tree-shakes the whole Supabase client out of the bundle — so sizes read ~240 kB
instead of the ~460 kB Netlify actually ships.

```bash
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://tpewzbkcmpttrhiuxwqp.supabase.co
VITE_SUPABASE_ANON_KEY=verify-local-placeholder-anon-key
EOF
```

A placeholder key is fine — the sandbox cannot reach Supabase anyway, and every
request is intercepted (see "Drive it in a browser"). `.env.local` is
gitignored; delete it before the final build so the pushed state is clean.

## Type-check and build

```bash
npm install          # first run only
npm run build        # tsc -b && vite build — this is what Netlify runs
```

`npm run lint` is a type-check only (`tsc -b --noEmit`). A green `npm run build`
is the bar before any push, because Netlify runs exactly that command.

## Run it

```bash
npm run dev          # http://localhost:5173, hot reload
npm run preview      # http://localhost:4173, serves the built dist/
```

Prefer `npm run dev` while iterating; use `preview` to check the production
build (that is the one Netlify ships).

### With functions

```bash
netlify dev          # app + netlify/functions together
```

Needed for anything under `netlify/functions` — the MCP endpoint at `/mcp` in
particular. Plain `npm run dev` will 404 those routes.

## Drive it in a browser

Chromium is pre-installed at `/opt/pw-browsers/chromium`. Playwright's bundled
browser version may not match, so always pass `executablePath` explicitly and
never run `playwright install`.

```js
import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark', // headless defaults to light, which hides the dark theme
})
page.on('pageerror', (e) => console.error('page error:', e))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: 'shell.png' })
await browser.close()
```

Install `playwright` into a scratch directory rather than adding it to
`package.json` — it is a verification tool, not an app dependency.

**Always check both themes.** Dark and light both come from tokens in
`src/styles/theme.css`; a hardcoded colour in a component only shows up when you
flip `colorScheme`.

### Anything behind the sign-in gate needs a fake Supabase

The sandbox cannot reach `*.supabase.co`, so intercept it and answer from an
in-memory store:

```js
await page.route('**/rest/v1/**', handleRest)  // notes, links, RPCs
await page.route('**/auth/v1/**', handleAuth)  // return a session for /token
```

Two things that will waste an hour if you don't know them:

- A request whose `accept` header is `application/vnd.pgrst.object+json` came
  from `.single()` and wants **one object**, not an array.
- PostgREST filters arrive as query params in their own syntax — `id=eq.x`,
  `id=in.(a,b)`, `indexed_at=is.null`. Match on those, not on the raw URL.

### PWA checks

A service worker only controls the page from the *second* load, so reload once
before asserting `navigator.serviceWorker.controller`. The strongest single
check is `context.setOffline(true)` then reload: the app shell must still
render. The vault will not load offline, and is not meant to.

## What to actually check

- No console or page errors (listen for `pageerror` and `console` type `error`).
- The status bar version matches `package.json` — it is the single source of
  truth and reaches the bundle through the `__APP_VERSION__` define in
  `vite.config.ts`.
- Both themes render: `colorScheme: 'dark'` and `'light'`, plus the manual
  toggle (the settings button in the ribbon).
- Keyboard paths work, not just clicks — Pitchstone is a keyboard-first app.
- Long lists scroll *inside* their panel and the page itself never scrolls
  (`document.documentElement.scrollHeight - clientHeight` should be 0).

## Data

The vault lives in Supabase (`Tijamo-hub`, project `tpewzbkcmpttrhiuxwqp`) in
`pitchstone_*` tables under RLS. Use the Supabase MCP tools to inspect rows
directly when confirming that a write from the UI or from the MCP server landed
as expected — checking the UI alone will not catch a link that failed to
resolve.
