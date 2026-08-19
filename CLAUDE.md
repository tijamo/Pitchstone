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

## What's in the repo

Everything here is convention scaffolding — no app code yet.

- `CLAUDE.md` — this file.
- `.claude/settings.json` — allowlists the two read-only Netlify MCP tools so
  deploy polling doesn't prompt, and wires the `SessionStart` hook.
- `.claude/hooks/session-start.sh` — copied verbatim from Dodo. No-ops unless
  `CLAUDE_CODE_REMOTE=true`, and bails if the working tree is dirty.
- `.gitattributes` — LF normalization.

## Not yet set up

Deliberately left out because there's no application code yet — add each one as
part of the scaffold, not before:

- `package.json` (starting version `0.1.0`, per the first-release convention).
- `netlify.toml` — build command and publish directory depend on the stack.
  Dodo's is Vite: `command = "npm run build"`, `publish = "dist"`, plus an SPA
  fallback redirect. Netlify currently reports this project's framework as
  `unknown` and is publishing the repo root.
- A `verify` skill (`.claude/skills/verify/SKILL.md`) describing how to build,
  launch, and drive the app locally. Dodo has one; this should too once there's
  something to launch.
- A changelog. Dodo keeps its in-app changelog as a plain data array in
  `src/changelog.ts` (`{ ver, title, items }`, newest first, keyed by minor
  version) rather than hardcoded JSX — worth copying that shape if Pitchstone
  grows a What's-new surface.
