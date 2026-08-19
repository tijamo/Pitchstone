# Pitchstone — Claude Code notes

New project, scaffolded as of 2026-08-19. There is **no application code yet** —
this repo currently contains only the conventions below. Versioning, git, and
deployment rules are carried over deliberately from Dodo (`tijamo/Dodo`), so
switching between the two projects doesn't mean switching habits. Project
notes (architecture, current state, gotchas) get added under their own headings
as the app takes shape.

## Versioning

The version lives in `package.json` `"version"` and is the single source of
truth. The app should display it directly (e.g. `1.2.14`) once there's a UI to
display it in.

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
  leftover merged branch on origin as something outstanding. (There is one such
  branch on origin right now, `claude/versioning-deployment-rules-igyqxs`, fully
  merged into `main` — leave it alone.)

## Deployment

Netlify auto-deploys on push to `main` via its native GitHub integration
(configured in Netlify's dashboard, not from this repo). Same shape as Dodo: no
GitHub Action does the shipping, so if deploys ever stop working, check
Netlify's own deploy log first. Confirmed working — the first push to `main`
(`2ad91b0`) built and published in 7s.

**Site details:**

- Site name: `pitchstone` (Tijamo team)
- Site ID: `900a0529-f25d-4e9b-9c2a-1112fd588547`
- URL: https://pitchstone.netlify.app
- Admin: https://app.netlify.com/projects/pitchstone

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

## Architecture

Pitchstone is a light Obsidian clone: connected markdown notes, an
Obsidian-style three-pane interface, and (from Phase 6) an MCP server so Claude
can read and write the same vault.

- **Frontend:** Vite + React + TypeScript. Zustand for state, CodeMirror 6 for
  the editor, `d3-force` on canvas for the graph. Plain CSS with custom
  properties — every colour lives in `src/styles/theme.css`, components never
  hardcode one.
- **Data:** the vault lives in Supabase, in the shared **Tijamo-hub** project
  (`tpewzbkcmpttrhiuxwqp`, eu-west-1), following the same convention as every
  other Tijamo app: prefixed tables (`pitchstone_*`) under RLS keyed on
  `auth.uid() = user_id`, sharing the existing auth users.
- **MCP:** a Netlify Function at `/mcp` speaking Streamable HTTP, authenticated
  by a personal token hashed into `pitchstone_api_tokens`. Hosting the vault
  remotely is what makes this possible at all.
- **Link handling** deliberately splits in two so the app and the MCP server can
  never drift: *extraction* of `[[wikilinks]]` and `#tags` lives in one shared
  TypeScript module imported by both, while *resolution* (title →
  `target_note_id`, including links that were unresolved until their target was
  created) lives in a SQL function.

The full phase-by-phase build plan — data model, feature scope, and the version
each phase maps to — was agreed on 2026-08-19. Each phase is a feature set, so
each needs Tim's go-ahead for its minor bump.

## What's in the repo

- `CLAUDE.md` — this file.
- `.claude/settings.json` — allowlists the two read-only Netlify MCP tools so
  deploy polling doesn't prompt, and wires the `SessionStart` hook.
- `.claude/hooks/session-start.sh` — copied verbatim from Dodo. No-ops unless
  `CLAUDE_CODE_REMOTE=true`, and bails if the working tree is dirty.
- `.claude/skills/verify/SKILL.md` — how to build, launch, and drive the app
  locally, including the Playwright/Chromium setup gotchas.
- `package.json` — version lives here and nowhere else.
- `netlify.toml` — build command, publish dir, functions dir, SPA fallback.
- `vite.config.ts` — exposes `package.json`'s version to the bundle as
  `__APP_VERSION__`, which the status bar renders.
- `src/changelog.ts` — in-app changelog as plain data, newest first, keyed by
  minor version (Dodo's `{ ver, title, items }` shape).
- `src/styles/`, `src/components/`, `src/store/` — theme tokens, the app shell,
  and UI state.
- `.gitattributes` — LF normalization.

## Not yet set up

- **Netlify environment variables**, which Tim needs to add (the allowlisted
  Netlify MCP tools are read-only):
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — public, needed
    from Phase 1 onward.
  - `SUPABASE_SERVICE_ROLE_KEY` — secret, server-side only, needed from Phase 6
    for the MCP function.
- **Supabase tables** — the `pitchstone_*` migration lands with Phase 1.
- **Tests.** No test runner yet; verification is currently a green
  `npm run build` plus driving the app per the `verify` skill.
