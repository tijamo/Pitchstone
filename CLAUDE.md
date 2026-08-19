# Pitchstone — Claude Code notes

A light Obsidian clone, started 2026-08-19. Versioning, git, and deployment
rules are carried over deliberately from Dodo (`tijamo/Dodo`), so switching
between the two projects doesn't mean switching habits.

**Current state: v0.6.0.** The app is real and deployed — auth, a Supabase
vault, a three-pane shell, a CodeMirror editor with live-preview wikilinks,
backlinks, a force-directed graph, tags, full-text search, an installable PWA,
and an MCP server so Claude can use the vault as its memory. See "Where the
build has got to" below for what each phase covered.

## Versioning

The version lives in `package.json` `"version"` and is the single source of
truth. It reaches the bundle through the `__APP_VERSION__` define in
`vite.config.ts`, and is rendered in the status bar and on the sign-in card.

**Rules:**

- Bump `package.json` `"version"` in the same commit as the change, and include
  the new version (e.g. `v1.2.14`) in the commit message.
- **Patch releases:** Iterate on every push. The patch number is the number of
  pushes since the last minor release (e.g. if the last minor release was `1.2`,
  patch releases are `1.2.1`, `1.2.2`, …). It's a recomputed count, not a
  blind `+1` — so a missed push self-corrects.
- **Minor releases:** Created when new features are added. Requires Tim's
  confirmation/approval before proceeding.
- **Major releases:** At Tim's discretion, or our suggestion — never inferred
  from commit content on our own.

If Tim just says "release this" with no major/minor language, it's a patch.

## Git

- Work directly on `main` — no feature branches. Commit and push to `main` as
  work completes.
- Include the full version (e.g. `v1.2.14`) in commit messages.
- **On Claude Code on the web:** a `SessionStart` hook
  (`.claude/hooks/session-start.sh`) checks out and fast-forwards `main` from
  `origin` at the start of every session, since each web session otherwise
  starts on a fresh ephemeral branch. A task/PR-triggered session can carry its
  own explicit branch instructions (e.g. "develop on branch X") that override
  this default for the duration of that task — that's expected, not a bug. But
  the destination is still always `main`: once the task's work is committed and
  pushed to that branch, fold it straight back in (fast-forward `main` to it,
  push `main`, delete the *local* branch) rather than leaving it stranded on a
  branch — otherwise it never reaches `main` and the next session's hook won't
  see it.
- **Only ever delete local branches.** Tim removes the remote ones himself —
  don't `git push --delete` / `git push origin :branch`, and don't flag a
  leftover merged branch on origin as something outstanding. Several `claude/*`
  branches sit on origin fully merged into `main`; that is the normal resting
  state here, not a loose end. Don't list them as cleanup.

## Deployment

Netlify auto-deploys on push to `main` via its native GitHub integration
(configured in Netlify's dashboard, not from this repo). Same shape as Dodo: no
GitHub Action does the shipping, so if deploys ever stop working, check
Netlify's own deploy log first. Reliable so far — builds land in 7–20s. The
site has no Lighthouse plugin configured, so deploys report
`lighthouse: null`; don't wait for scores that aren't coming.

**Site details:**

- Site name: `pitchstone` (Tijamo team)
- Site ID: `900a0529-f25d-4e9b-9c2a-1112fd588547`
- URL: **https://pitchstone.app** — the primary domain. `pitchstone.netlify.app`
  still resolves and is what earlier notes here said, but Netlify reports
  `pitchstone.app` as the site's URL, so that is the one to quote.
- MCP endpoint: https://pitchstone.app/mcp
- Admin: https://app.netlify.com/projects/pitchstone

**Environment variables** (set on the site, context `all`):

| Key | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Tijamo-hub project URL; read at build time by Vite. |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. Not secret — it ships in the bundle and RLS is the actual protection. |

Both are **required**: `vite.config.ts` fails the build when `NETLIFY` is set and
either is missing, so a misconfigured deploy errors out instead of publishing an
app that cannot reach its vault. Note that `manage-env-vars` needs the write
Netlify tool, and its `getAllEnvVars` listing can lag by a minute after an
upsert — read it back twice before concluding a variable did not save.

**Rule:** after bumping the version and pushing to `main`, track the resulting
deploy via the Netlify MCP tools — poll `netlify-project-services-reader` →
`get-project` (or `netlify-deploy-services-reader` → `get-deploy-for-site`)
**silently** every 15s, checking whether `currentDeploy`/`commit_ref` has moved
past the pre-push deploy. Only post a chat message once something changes:
either the new commit's deploy goes `ready` (report ready + deploy time +
Lighthouse scores) or `error` (report the error). If 5 minutes pass with no
change, stop polling and say so — there may be a stuck build. This is standard
procedure for every push, not just when asked; the read-only Netlify tools are
allowlisted in `.claude/settings.json` so this doesn't prompt for permission.

## Using the vault as memory

Pitchstone's own MCP server is wired up in `.mcp.json`, so a session in this
repo gets `list_notes`, `read_note`, `search_notes`, `write_note`, and the rest
against the live vault. Two things have to be true for it to connect:

1. **`PITCHSTONE_TOKEN` is set** to a personal token — made in the app under
   Settings → Claude access, and shown only once, since only its hash is
   stored. Locally that is a shell variable; for a Claude Code web session it
   is an environment variable on the environment itself.
2. **The environment's network policy allows `pitchstone.app`.** A web session
   whose policy does not will report
   `request blocked: no rule or allowlist entry allows host "pitchstone.app"`
   against the server in `claude mcp list` — that is the policy talking, not a
   bad token. See https://code.claude.com/docs/en/claude-code-on-the-web.

`claude mcp list` is the quick check; a working server reads `✔ Connected`.

## Architecture

Pitchstone is a light Obsidian clone: connected markdown notes, an
Obsidian-style three-pane interface, and (from Phase 6) an MCP server so Claude
can read and write the same vault.

- **Frontend:** Vite + React + TypeScript. Zustand for state, CodeMirror 6 for
  the editor, `d3-force` on canvas for the graph. Plain CSS with custom
  properties — every colour lives in `src/styles/theme.css`, components never
  hardcode one.
- **Auth:** email and password, the same model as Dodo — `signInWithPassword` /
  `signUp` behind one form with a sign-in ⇄ create-account toggle, no magic
  links. Supabase's "Confirm email" is off, so signing up returns a session
  immediately. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come from the
  environment and are **not** committed, again matching Dodo; both are set as
  Netlify env vars for the deployed site.
- **Data:** the vault lives in Supabase, in the shared **Tijamo-hub** project
  (`tpewzbkcmpttrhiuxwqp`, eu-west-1), following the same convention as every
  other Tijamo app: prefixed tables (`pitchstone_*`) under RLS keyed on
  `auth.uid() = user_id`, sharing the existing auth users.
- **MCP:** a Netlify Function at `/mcp` speaking Streamable HTTP, authenticated
  by a personal token hashed into `pitchstone_api_tokens`. Hosting the vault
  remotely is what makes this possible at all. **There is no service-role key.**
  The function holds only the public anon key, and the one thing that key can
  reach without a signed-in session is the `pitchstone_mcp_*` surface: security
  definer functions that each take the raw token first and derive the user id
  from it, so a user id is never something a caller supplies. That is why every
  MCP operation is its own SQL function rather than a query in TypeScript — the
  narrow door is the security model.
- **Link handling** deliberately splits in two so the app and the MCP server can
  never drift: *extraction* of `[[wikilinks]]` and `#tags` lives in one shared
  TypeScript module imported by both, while *resolution* (title →
  `target_note_id`, including links that were unresolved until their target was
  created) lives in a SQL function.
- **Derived data is rebuildable, not write-once.** A note's tags, frontmatter,
  and outgoing links are extracted client-side and written by
  `pitchstone_save_note` on every save. `indexed_at` marks whether that has
  ever happened; anything null is caught up by a backfill pass on vault load
  (`backfillIndex`, batched at 100). That is what makes the parser's single
  home affordable — reindexing does not need a SQL parser, it just re-runs the
  TypeScript one. `pitchstone_reindex_note` writes the derived data without
  touching `content`, and the write trigger leaves `updated_at` alone when
  neither text nor path changed, so a backfill doesn't restamp the vault.

The phase-by-phase build plan was agreed with Tim in conversation on
2026-08-19 and **is not written down anywhere in this repo** — not as a doc, an
issue, or a PR. Don't go looking for it; ask Tim what a phase covers before
building it. Each phase is a feature set, so each needs his go-ahead for its
minor bump.

## Where the build has got to

| Version | What landed |
| --- | --- |
| 0.1 | App shell: ribbon, three panes, status bar, theme tokens. |
| 0.2 | The real vault — auth, Supabase notes, the file explorer. |
| 0.3 | CodeMirror editor: live-preview wikilinks, `[[` completion, outline. |
| 0.4 | Phase 3 — backlinks, graph, tags, search. Then resizable panels, the graph moved to the right sidebar, and the index backfill. |
| 0.5 | Installable PWA and the Pitchstone mark. |
| 0.6 | Phase 6 — the MCP server at `/mcp`, personal tokens, and a settings dialog. |

Phase 3 was backlinks, graph, tags, and search, and shipped as 0.4.0; Phase 6
was the MCP server and shipped as 0.6.0 — both known because Tim said so
directly. Which phase numbers 0.1–0.3 correspond to was never recorded, and
phases 4 and 5 are still unknown here. Ask rather than guessing the mapping.

## What's in the repo

- `CLAUDE.md` — this file.
- `.claude/settings.json` — allowlists the two read-only Netlify MCP tools so
  deploy polling doesn't prompt, and wires the `SessionStart` hook.
- `.mcp.json` — points Claude Code at Pitchstone's own MCP server, so a session
  in this repo can use the vault as memory. The token is **not** in the file:
  it expands from `PITCHSTONE_TOKEN`, because this repo is public. See
  "Using the vault as memory" below.
- `.claude/hooks/session-start.sh` — copied verbatim from Dodo. No-ops unless
  `CLAUDE_CODE_REMOTE=true`, and bails if the working tree is dirty.
- `.claude/skills/verify/SKILL.md` — how to build, launch, and drive the app
  locally, including the Playwright/Chromium setup gotchas.
- `package.json` — version lives here and nowhere else.
- `index.html` — icon links, the iOS web-app meta tags, and a `theme-color`
  per colour scheme so OS chrome follows the theme.
- `.env.example` — the two `VITE_` keys. Copy to `.env.local` to run locally.
- `netlify.toml` — build command, publish dir, functions dir, SPA fallback, and
  a no-cache header on `/sw.js`.
- `netlify/functions/mcp.mts` — the `/mcp` route and nothing else. It declares
  its own `config.path`, which registers the route *ahead* of the SPA fallback;
  without that, `netlify.toml`'s `/*` rule would answer `/mcp` with the app.
- `netlify/lib/mcp/` — the server proper, out of the functions directory so
  Netlify does not treat each file as another function and so the tests can
  import it: `server.ts` (JSON-RPC and the HTTP transport), `tools.ts` (the
  nine tools and what they say back), `vault.ts` (the RPC calls), and
  `server.test.ts`.
- `vite.config.ts` — exposes `package.json`'s version to the bundle as
  `__APP_VERSION__`, which the status bar renders, and configures
  `vite-plugin-pwa` (manifest, icons, precache).
- `public/` — the icons that ship: `icon.svg` (also the favicon), the 192/512
  PNGs, the maskable 512, and `apple-touch-icon.png`.
- `design/` — icon *sources*: the maskable SVG master and `render-icons.mjs`,
  which rasterizes the PNGs through Chromium. Not served, not precached.
- `src/pwa.ts` — service worker registration.
- `src/changelog.ts` — in-app changelog as plain data, newest first, keyed by
  minor version (Dodo's `{ ver, title, items }` shape).
- `src/styles/` — `theme.css` (every colour, plus the light overrides) and
  `app.css`. Sidebar widths are *not* tokens: they are resizable, so `uiStore`
  owns them and sets them inline.
- `src/store/` — `uiStore` (tabs, panel widths, theme), `authStore`,
  `vaultStore` (notes, the open note, autosave, `linksVersion`).
- `src/components/` — the shell (`Ribbon`, `LeftSidebar`, `RightSidebar`,
  `EditorPane`, `StatusBar`, `LoginGate`), the panels (`FileTree`,
  `SearchPanel`, `TagsPanel`, `GraphView`), `SettingsModal`, `Resizer`, `Icon`,
  and `Mark`.
- `src/lib/` — the Supabase client, vault path helpers (`paths.ts`), the note
  data access layer (`notes.ts`), personal tokens (`tokens.ts`), and
  `markdown/parse.ts`, the shared extraction module (see Architecture) with its
  unit tests beside it.
- `src/components/editor/` — the CodeMirror 6 editor: the wikilink syntax
  extension, the live-preview decorations, the theme, and `[[` completion.
- `supabase/migrations/` — the applied schema, kept in the repo for the record.
  Migrations are applied through the Supabase MCP tools, not a local CLI, so a
  file here is a record of a change already made — writing one does not apply
  it.
- `tsconfig.*.json` — `app` for the build graph, `node` for Vite's config,
  `netlify` for the function, `test` for the unit tests (deliberately outside
  the app's graph).
- `.gitattributes` — LF normalization.

## Gotchas

- **The sandbox reaches neither `pitchstone.netlify.app` nor
  `*.supabase.co`.** The agent proxy denies both (403 on CONNECT), so a deploy
  can only be confirmed through the Netlify MCP tools, and the signed-in app
  can never be driven against real Supabase from here. Don't waste a poll loop
  on either.
- **So the signed-in UI is driven against a fake.** Intercept both
  `**/auth/v1/**` and `**/rest/v1/**` with Playwright's `page.route` and answer
  them from an in-memory store; the schema itself is verified separately by SQL
  through the Supabase MCP tools. Requests narrowed by `id=eq.…` come from
  `.single()` and need one object back, not an array.
- **A missing env var is not a compile error**, so `vite.config.ts` fails the
  build outright when `NETLIFY` is set and the Supabase keys are absent. That
  keeps the last good deploy published instead of quietly shipping an app that
  cannot reach its own vault.
- **A local build with no `.env.local` is not the build Netlify ships.** Vite
  inlines `import.meta.env.VITE_SUPABASE_URL` as `undefined`, which makes
  `url && anonKey ? createClient(…) : null` statically false, so Rollup
  tree-shakes the entire Supabase client out — the main chunk comes in around
  240 kB instead of ~460 kB. Nothing warns you. Write a throwaway `.env.local`
  (it is gitignored) before reading bundle sizes or driving the signed-in app,
  and don't report a local size as the shipped one.
- **The sign-in gate is the tell.** Without those keys `isConfigured` is false
  and the app renders "Pitchstone isn't configured" instead of the login form —
  so a Playwright run that can't find `#email` usually means a missing
  `.env.local`, not a broken selector.
- **Folders are derived from paths**, not stored. A folder exists exactly as
  long as a note sits in it, so there is no such thing as an empty folder.
- **Wikilinks are parsed twice, and the two must agree.** `lib/markdown/parse.ts`
  scans note text for storage and search; `components/editor/wikilinkSyntax.ts`
  is a lezer inline parser so the editor ignores links inside code blocks.
  Change one rule and change the other — brackets are already excluded from
  targets in both.
- **The mark lives in three places and they must agree**: `public/icon.svg`
  (favicon and the source for the PNGs), `design/icon-maskable.svg` (same mark,
  full-bleed ground, inside Android's 80% safe circle), and
  `src/components/Mark.tsx` (inlined for the sign-in screen). Change the shape
  and change all three, then re-run `design/render-icons.mjs`.
- **The service worker is registered in 'prompt' mode but updates immediately
  anyway.** Not to ask anyone anything — it is the only way to flush a pending
  autosave *before* the page reloads. Plain `autoUpdate` reloads the moment the
  new worker lands, which in a notes app can be mid-sentence. See `src/pwa.ts`.
- **Nothing from Supabase is cached.** The precache is the app shell only, so
  the app opens offline but the vault does not load. That is deliberate:
  serving yesterday's notes, and accepting edits that cannot be saved, would be
  worse than saying plainly that there is no connection.
- **The MCP server's SQL is the only thing standing between the anon key and
  every vault.** Adding an operation means adding a `pitchstone_mcp_*` function
  that takes `p_token` first and calls `pitchstone_token_user`; never a plain
  table read, and never a uid parameter. And note that this Supabase project's
  *default privileges* grant execute on every new function in `public` to
  `anon` and `authenticated` — so `revoke ... from public` alone leaves the
  grant standing. Revoke from all three by name, and check with
  `has_function_privilege` afterwards rather than assuming.
- **Netlify treats every file in `netlify/functions/` as a function**, which is
  why the MCP server lives in `netlify/lib/mcp/` with only a route file in
  `functions/`. Its imports carry real `.ts` extensions, because Node's type
  stripping runs those same files for the tests and resolves ESM specifiers
  literally — hence `allowImportingTsExtensions` in `tsconfig.netlify.json`.
  For the same reason nothing there may use a TypeScript feature that is more
  than type erasure: a constructor parameter property will type-check and then
  fail at test time.
- **A note written over MCP is parsed by the same TypeScript the editor uses.**
  `netlify/lib/mcp/vault.ts` calls `collectTags`/`extractLinks`/
  `parseFrontmatter` before the write, exactly as `saveContent` does. If a note
  ever arrives in the vault with no tags, suspect a write path that skipped
  that step rather than the parser.
- **`@codemirror/lang-markdown` drags in the HTML, JavaScript, and CSS modes**,
  which is larger than the rest of the app put together. The editor is therefore
  lazy-loaded, and `components/editor/editorHandle.ts` deliberately imports
  nothing from CodeMirror — the outline panel imports it, so a single type
  import there pulls the whole editor back into the main chunk.

## Not yet set up

- **Component and end-to-end tests.** `npm test` covers `lib/markdown/parse.ts`
  and the MCP server's protocol layer (`netlify/lib/mcp/server.test.ts`, which
  stubs Supabase at the `fetch` boundary), through Node's built-in runner and
  type stripping — `tsconfig.test.json` type-checks both separately, outside
  the app's build graph. Everything else is verified by driving the app per the
  `verify` skill.
- **No git tags and no GitHub releases.** Versions live in `package.json` and
  commit messages only, so the `version-release` skill's tag-counting maths
  doesn't apply here — count pushes since the last minor by reading the log.

## Deliberately not done

Worth knowing so they don't get "fixed" by accident:

- **Offline access to the vault.** The precache is the app shell; notes need
  the network. Real offline means a sync queue and conflict handling, which is
  a feature in its own right, not a side effect of having a service worker.
- **Empty folders.** They cannot exist — see the gotcha above.
- **Unlinked mentions**, clickable `#tags` inside the editor, and search over
  tags. All plausible, none built, none promised.
- **MCP resources and prompts.** The server advertises tools only. A note is
  more usefully reached through `read_note`, which resolves a title as readily
  as a path, than pinned as a resource a client has to enumerate first.
- **MCP sessions and SSE.** `/mcp` answers a POST with one JSON response and
  refuses GET. A serverless function cannot honourably hold a stream open, and
  Streamable HTTP explicitly permits this shape.
