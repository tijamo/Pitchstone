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

The vault **is** the memory. Pitchstone's own MCP server is wired up in
`.mcp.json`, so a session in this repo gets `vault_info`, `list_notes`,
`read_note`, `search_notes`, `write_note`, `backlinks`, `list_tags`,
`rename_note`, and `delete_note` against the live vault at
https://pitchstone.app/mcp. Three things have to be true for it to connect:

1. **`PITCHSTONE_TOKEN` is set** to a personal token — made in the app under
   Settings → Claude access, and shown only once, since only its hash is
   stored. Locally that is a shell variable; for a Claude Code web session it
   is an environment variable on the environment itself.
2. **The environment's network policy allows `pitchstone.app`.** A web session
   whose policy does not will report
   `request blocked: no rule or allowlist entry allows host "pitchstone.app"`
   against the server in `claude mcp list` — that is the policy talking, not a
   bad token. See https://code.claude.com/docs/en/claude-code-on-the-web.
3. **The server is approved.** A project-scoped `.mcp.json` server needs the
   user to approve it, and nobody is there to click anything in a web session —
   it just sits at `⏸ Pending approval` and the tools never load, with no
   error to explain why. `.claude/settings.json` therefore lists it under
   `enabledMcpjsonServers`, which is the standing approval. The six read tools
   and `write_note` are also in `permissions.allow` there, so recording
   something doesn't interrupt anyone; `rename_note` and `delete_note`
   deliberately still prompt.

`claude mcp list` is the quick check; a working server reads `✔ Connected`.
If it doesn't, work out which of the three is missing before assuming the
token is bad — all three fail silently in different ways.

### What goes where

CLAUDE.md and the vault are not competing. **This file is the startup memory
for this repo**: conventions, architecture, gotchas — things that are true of
the code, reviewed in a diff, and worth reading before touching anything. The
vault holds what a commit can't: what happened across sessions, what Tim
decided and why, and anything that shouldn't live in a public repo. If a fact
is about the code, it belongs here. If it's about the work, it belongs in the
vault.

### Where memory lives in the vault

Everything Claude writes goes under `Memory/`, so Tim's own notes stay at the
top level and the file tree doesn't fill up with machine minutes:

```
Memory/
  Projects/<Project>/state.md              ← current truth, rewritten in place
                    /dcsn-YYYY-MM-DD-<slug>.md  ← one note per decision
                    /gotchas.md             ← things that bit us
  Patterns/<topic>.md                      ← what carries across projects
```

A dated, cross-project session log (`Memory/Sessions/*`) was tried and retired
on 2026-08-24 — it pulled against the point of `state.md` being the one thing
a cold session reads, by giving a project fact a second place to live.

**`state.md` is the one that earns its keep** — stack, deploy targets, what is
done, what is mid-flight, what is blocked — and it is the read path that
decides this shape, not the write path. Reconstructing "what is true about this
project" out of a hundred dated notes is slow and lossy; one note kept current
is not. So a cold session reads `state.md` and is oriented, and everything else
is reference.

**Decisions are one note per decision, not a shared log.** Changed 2026-08-25,
by Tim's direct order — retiring the single per-project `decisions.md` this
same section used to describe, in favour of
`Memory/Projects/<Project>/dcsn-YYYY-MM-DD-<slug>.md`, one per decision, tagged
`decision`. The single-file shape was already the second attempt at this (it
replaced a dated cross-project log on 2026-08-21, for the same "everything
about this project" read-path reason `state.md` exists), and it had its own
cost: nothing inside a growing shared log is individually linkable, and
`write_note` has no partial-append, so recording one decision meant reading
and rewriting every decision that came before it. See
`Memory/Projects/Pitchstone/dcsn-2026-08-25-decisions-become-individual-notes.md`
in the vault for the full record — including that it's a direct order, not an
inferred preference.

**Logs record that a decision happened; `state.md` records what is true now.**
That is the rule that stops old history from lying: a decision from three
weeks ago says "we're using X" long after X was ripped out. Where a decision
note and `state.md` disagree, `state.md` is right and the note is history.

Conventions that keep it usable:

- **Rewrite `state.md`; append `gotchas.md`; write a decision note once.**
  `write_note` with `mode: "append"` for `gotchas.md` only. Decision notes are
  written once and not appended to — a later reversal gets its own new dated
  note rather than editing the old one, the same way `state.md`'s history
  isn't edited when a fact changes, only superseded.
- **Tag every memory note `#memory`**, plus a project tag (`#pitchstone`,
  `#dodo`), and every decision note additionally `#decision`.
  `list_tags`/tag-filtered `list_notes` is how a cold session finds what's
  already there — including, now, every decision across every project in one
  query.
- **Search before writing.** `search_notes` first: the vault very often already
  knows, and a second note saying the same thing is worse than none. This
  still applies to `state.md` and `gotchas.md`; a decision note is written
  once by design, so there's nothing to find-and-update there.
- **Refer to memory notes by full path, never a bare title.** `read_note` and
  `[[wikilinks]]` resolve a title regardless of folder, and every project now
  has a note titled "state" — so `[[state]]` is ambiguous and
  `read_note("state")` is a coin toss. A bare project name is worse than
  ambiguous: since project memory split into `state.md`/`dcsn-*.md`/
  `gotchas.md`, no note is titled just "Pitchstone" or "Dodo" — that folder
  isn't a note — so `[[Pitchstone]]` resolves to nothing and the link goes
  dead silently. Link to the specific note instead, e.g.
  `[[Memory/Projects/Pitchstone/state]]`.
- **Link, don't repeat.** A daily entry says what happened and links out; the
  project's own notes carry the settled version.

### At the start and end of a session

Open with `vault_info`, read `Memory/Projects/Pitchstone/state.md` before
building anything, and `search_notes` for the task in hand. Close by updating
`state.md` if what's true has changed, and writing a new decision note or
appending to `gotchas.md` if there was one. Something learned the hard way is
worth writing down the moment it's learned, not at the end.

On a machine with the `pitchstone-memory` plugin installed (see below) a
`SessionStart` hook says all this at the top of every session, with this
project's paths filled in.

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
- **Responsive layout** has one breakpoint, 700px, and it is written down
  twice on purpose: `MOBILE_BREAKPOINT` in `uiStore` and the `@media` block at
  the end of `app.css`. Layout is the stylesheet's job — the shell's grid, the
  drawers, the bottom ribbon — while *behaviour* that changes with it is the
  store's: which panels start open, that opening one drawer closes the other,
  and that opening a note puts the drawer away. `App` watches the media query
  and calls `setMobile`, so the two never disagree for longer than a frame.
- **Link handling** deliberately splits in two so the app and the MCP server can
  never drift: *extraction* of `[[wikilinks]]` and `#tags` lives in one shared
  TypeScript module imported by both, while *resolution* (title →
  `target_note_id`, including links that were unresolved until their target was
  created) lives in a SQL function.
- **A title only has to be unique enough to say what it means.** The vault's own
  per-project shape (`Memory/Projects/<Project>/gotchas.md`, one per project, on
  purpose) guarantees the same title exists more than once, so nothing may
  resolve "the note named X" by title alone and pick an arbitrary match — that
  is a link silently pointing at the wrong project's note, or an MCP write
  silently landing in one. `pitchstone_notes_matching` in SQL is the one rule
  every resolver goes through: a bare word matches by title, a `/`-qualified
  reference (`Pitchstone/gotchas`) matches by the *trailing segments* of a
  note's path, and anything that matches more than one note is ambiguous —
  never resolved as a coin flip. `pitchstone_note_id_for` (the MCP path/title
  argument) raises when that happens; `pitchstone_resolve_links` leaves the
  link unresolved rather than guessing. `src/lib/markdown/resolve.ts` is the
  client-side mirror of that same rule — `matchNotesByTarget`,
  `shortestUniqueSuffix`, `duplicateTitles` — used by the `[[` completion list,
  the editor's live-preview coloring, the graph's placeholder nodes, and the
  backlinks/search/tags panels' path subtext. **This is the same "parsed
  twice" shape as wikilink extraction above, and needs the same discipline**:
  change the matching rule in one and the other silently disagrees about what
  a link means.
- **An ambiguous link is a third state, not a fallback to unresolved.** The
  editor colors a `[[link]]` three ways — resolved (`.cm-wikilink`), unresolved
  (`--unresolved`, dashed, a note not yet written), ambiguous (`--ambiguous`,
  dotted, a name more than one note answers to) — because the fix for the
  latter two is different: write a note, or qualify the link. Clicking an
  ambiguous link or graph placeholder opens `<LinkChoice>` (`uiStore.linkChoice`)
  instead of guessing or creating a duplicate; it is anchored at the click,
  like a context menu, and closes on a pick, Escape, or an outside click.
- **Live updates have one merge, not three.** The vault is written from more
  than one place — this tab, another device, and Claude through the MCP server
  — so `vaultStore.refresh()` reconciles against the server, and Realtime, the
  focus/visibility listener, and a 45s poll all just *call it*. None of them
  carries a payload: `postgres_changes` says only "something moved", because a
  merge that trusts an event is a second merge to keep correct. The poll runs
  only while the socket is down (`live.ts` reports status), and subscribing
  refreshes too, since nothing is replayed for the time it was disconnected.
  `openedAt` — the `updated_at` of the text in the editor, held beside the save
  timer — is what distinguishes somebody else's write from our own.
- **A conflict is a question, not a merge.** `saveContent` writes the whole
  document, so a note that changes under unsaved edits cannot be resolved by
  taking either side. `refresh` sets `openNoteStale` and *holds the queued
  write* — the timer is cancelled, `pendingWrite` is kept — and `flush` refuses
  to write while that flag is set, so leaving the note or closing the tab takes
  the server's copy. `keepLocalEdits` clears the flag and flushes; the notice
  says so, because a held save the writer does not know about is worse than
  either outcome.
- **Derived data is rebuildable, not write-once.** A note's tags, frontmatter,
  and outgoing links are extracted client-side and written by
  `pitchstone_save_note` on every save. `indexed_at` marks whether that has
  ever happened; anything null is caught up by a backfill pass on vault load
  (`backfillIndex`, batched at 100). That is what makes the parser's single
  home affordable — reindexing does not need a SQL parser, it just re-runs the
  TypeScript one. `pitchstone_reindex_note` writes the derived data without
  touching `content`, and the write trigger leaves `updated_at` alone when
  neither text nor path changed, so a backfill doesn't restamp the vault.
- **A vault is already an Obsidian vault**, so import/export (v0.14,
  `lib/vaultTransfer.ts`) is a zip of `.md` files at their own paths, nothing
  bespoke. Export needs no schema help — every note's `content` already holds
  its own frontmatter and `[[links]]` as text. Import sanitizes each zip path
  the same way a manual rename does, dedupes a collision with `uniquePath`,
  and leaves tags/frontmatter/links for the next load's backfill to derive —
  see "Derived data is rebuildable" above. JSZip is dynamic-`import()`-ed from
  the Settings modal, so it never reaches the main bundle unused.
- **A folder can be a note, by the same convention Obsidian's "Folder Notes"
  plugin uses.** `paths.ts`'s `folderNotePath(folder)` names the note at
  `<folder>/<folder-name>.md`; `buildTree` recognizes one and attaches it to
  the folder (without removing it from the listing), and `FileTree`/
  `GraphView` open it when the folder row or graph square is clicked,
  highlighting like an active note while keeping the folder's own icon. This
  is still just a note at a path — no schema change — which is what makes a
  folder with nothing else in it survive at all: `vaultTransfer.ts` gives an
  otherwise-empty directory from an imported zip exactly one such note (the
  deepest empty directory only; a note at `A/B/B.md` already keeps `A` alive
  too), so an empty folder now round-trips instead of silently vanishing.

The phase-by-phase build plan was agreed with Tim in conversation on
2026-08-19 and **is not written down anywhere in this repo** — not as a doc, an
issue, or a PR. Don't go looking for it; ask Tim what a phase covers before
building it. Each phase is a feature set, so each needs his go-ahead for its
minor bump.

## Where the build has got to

| Version | Phase | What landed |
| --- | --- | --- |
| 0.1 | 1 | App shell: ribbon, three panes, status bar, theme tokens. |
| 0.2 | 1 | The real vault — auth, Supabase notes, the file explorer. |
| 0.3 | 2 | CodeMirror editor: live-preview wikilinks, `[[` completion, outline. |
| 0.4 | 3 | Backlinks, graph, tags, search. Then resizable panels, the graph moved to the right sidebar, and the index backfill. |
| 0.5 | ? | Installable PWA and the Pitchstone mark. |
| 0.6 | 6 | The MCP server at `/mcp`, personal tokens, and a settings dialog. |
| 0.7 | ? | The mobile layout: one pane, drawer sidebars, a bottom ribbon. |
| 0.8 | ? | Live updates: the app follows the vault, whoever changed it. |
| 0.9 | ? | Disambiguation: duplicate titles resolve by folder, not by guessing. |

**A phase is not a version**, which is what made this confusing: phase 1 —
"initial data and UI setup" — shipped as both 0.1 and 0.2, so the columns
don't line up one to one. Phase 2 was editing capability (0.3) and phase 3 was
wikilinks and tags (0.4); Tim gave that mapping on 2026-08-20, and phases 3
and 6 were already known from him directly.

**Phases 4 and 5 are still unrecorded**, as is which phase 0.5 belonged to.
Ask rather than guessing, and write the answer down here when you get it.

## What's in the repo

- `CLAUDE.md` — this file.
- `.claude-plugin/marketplace.json` and `plugins/pitchstone-memory/` — the repo
  doubles as a Claude Code plugin marketplace. The plugin carries the MCP
  server, the `memory` skill, and a `SessionStart` hook, so any project on a
  machine gets the vault as memory without copying `.mcp.json` around. Nothing
  in it ships with the app; Netlify never sees it. **This repo deliberately
  does not enable the plugin on itself** — it already has a `pitchstone` server
  in `.mcp.json`, and the plugin's is a second server under a different name,
  so every tool would appear twice.
- `.claude/settings.json` — approves the `pitchstone` MCP server for every
  session (`enabledMcpjsonServers`), allowlists the two read-only Netlify MCP
  tools plus Pitchstone's read tools and `write_note` so deploy polling and
  memory don't prompt, and wires the `SessionStart` hook.
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
  `app.css`, whose last section is the one `@media` block that folds the shell
  to a single pane on a phone. Sidebar widths are *not* tokens: they are resizable, so `uiStore`
  owns them and sets them inline.
- `src/store/` — `uiStore` (tabs, panel widths, theme, the mobile flag),
  `authStore`,
  `vaultStore` (notes, the open note, autosave, `linksVersion`).
- `src/components/` — the shell (`Ribbon`, `LeftSidebar`, `RightSidebar`,
  `EditorPane`, `StatusBar`, `LoginGate`), the panels (`FileTree`,
  `SearchPanel`, `TagsPanel`, `GraphView`), `SettingsModal`, `LinkChoice` (the
  ambiguous-link popover), `Resizer`, `Icon`, and `Mark`.
- `src/lib/` — the Supabase client, vault path helpers (`paths.ts`, unit
  tested), the note data access layer (`notes.ts`), personal tokens
  (`tokens.ts`), live updates (`live.ts`), zip import/export
  (`vaultTransfer.ts`), and `markdown/parse.ts` (shared extraction, unit
  tested) and `markdown/resolve.ts` (shared title/path matching, unit tested)
  — see Architecture.
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
  long as a note sits in it — and since v0.14, that note can be the folder's
  own: `folderNotePath` names the note at `<folder>/<folder-name>.md`,
  Obsidian's own "Folder Notes" convention, and `buildTree`/`GraphView`
  recognize it and let it stand in for the folder (openable, highlighted when
  active) while it keeps the folder's own icon rather than a note's. Nothing
  about this needed a schema change — it's still just a note at a path.
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
- **A v2 function with a custom `config.path` is not reachable at the classic
  `/.netlify/functions/<name>` URL.** `netlify.toml` used to carry a redundant
  `[[redirects]]` rule forwarding `/mcp` to `/.netlify/functions/mcp` "so the
  endpoint doesn't depend on one mechanism" — but that legacy URL 404s for a
  path-routed v2 function, and because the redirect had `force = true` it fired
  *before* `config.path`'s own route could, so it shadowed the working route
  with a dead one. Production served a 404 on `/mcp` for this reason until
  v0.6.3, even though the function itself was deployed correctly. `config.path`
  is sufficient on its own; don't re-add a redirect alongside it.
- **Netlify treats every file in `netlify/functions/` as a function**, which is
  why the MCP server lives in `netlify/lib/mcp/` with only a route file in
  `functions/`. Its imports carry real `.ts` extensions, because Node's type
  stripping runs those same files for the tests and resolves ESM specifiers
  literally — hence `allowImportingTsExtensions` in `tsconfig.netlify.json`.
  For the same reason nothing there may use a TypeScript feature that is more
  than type erasure: a constructor parameter property will type-check and then
  fail at test time.
- **Realtime needs `replica identity full` on `pitchstone_notes`, and that is
  a security setting, not a performance one.** With the default identity a
  delete puts only the primary key in the WAL, so Realtime can apply neither
  the table's RLS policy nor the subscription's `user_id=eq.` filter to it —
  the choice is between deletes that never arrive and deletes that reach every
  subscriber as a bare uuid. The full row fixes both. Only
  `pitchstone_notes` is in the `supabase_realtime` publication; links are
  rewritten by the same statement that saves a note, so a note event already
  implies them.
- **CodeMirror only reloads its document when `contentVersion` changes.** The
  store bumps it whenever the text came from anywhere other than the editor —
  a note opened, or the open one reloaded from the server — and the editor
  keeps the cursor (clamped) when the id is unchanged and drops it to the top
  when it is not. Setting `content` in the store without bumping the counter
  changes nothing on screen.
- **A note written over MCP is parsed by the same TypeScript the editor uses.**
  `netlify/lib/mcp/vault.ts` calls `collectTags`/`extractLinks`/
  `parseFrontmatter` before the write, exactly as `saveContent` does. If a note
  ever arrives in the vault with no tags, suspect a write path that skipped
  that step rather than the parser.
- **A closed drawer parked off-screen will zoom the whole page out on a
  phone.** `body { overflow: hidden }` does not clip it: that value propagates
  to the viewport and leaves the body box itself `visible`, so a sidebar
  translated to `-100%` still counts towards the document's width, and mobile
  Chromium/Safari answer an over-wide document by shrinking the layout to fit
  — the app renders at about 0.54×, with `innerWidth` reading 725 on a 390px
  screen. The fix is `overflow: hidden` on `.shell` itself. Check
  `window.innerWidth` against the device width when a phone layout looks
  oddly small; nothing else reports this.
- **`@codemirror/lang-markdown` drags in the HTML, JavaScript, and CSS modes**,
  which is larger than the rest of the app put together. The editor is therefore
  lazy-loaded, and `components/editor/editorHandle.ts` deliberately imports
  nothing from CodeMirror — the outline panel imports it, so a single type
  import there pulls the whole editor back into the main chunk.

## Not yet set up

- **Component and end-to-end tests.** `npm test` covers `lib/markdown/parse.ts`,
  `lib/markdown/resolve.ts`, and the MCP server's protocol layer (`netlify/lib/mcp/server.test.ts`, which
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
- **Unlinked mentions**, clickable `#tags` inside the editor, and search over
  tags. All plausible, none built, none promised.
- **MCP resources and prompts.** The server advertises tools only. A note is
  more usefully reached through `read_note`, which resolves a title as readily
  as a path, than pinned as a resource a client has to enumerate first.
- **MCP sessions and SSE.** `/mcp` answers a POST with one JSON response and
  refuses GET. A serverless function cannot honourably hold a stream open, and
  Streamable HTTP explicitly permits this shape.
