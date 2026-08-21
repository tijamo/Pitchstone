# pitchstone-memory

Makes a [Pitchstone](https://pitchstone.app) vault Claude's memory in every
project, rather than in whichever repo happens to carry the config.

It bundles three things:

- **The MCP server** — the nine `pitchstone` tools against
  `https://pitchstone.app/mcp`.
- **A `memory` skill** — where a fact goes, and the rule that keeps the vault
  honest: logs record that a decision happened, `state.md` records what is true
  now.
- **A `SessionStart` hook** — names *this* project's memory notes at the top of
  every session, so remembering doesn't depend on being reminded.

## Install

```bash
claude plugin marketplace add tijamo/Pitchstone
claude plugin install pitchstone-memory@tijamo
export PITCHSTONE_TOKEN=…   # add to ~/.zshrc
```

The token is made in the app under **Settings → Claude access** and shown
once — only its hash is stored. `${PITCHSTONE_TOKEN}` is expanded in the
plugin's MCP config at launch, so the token itself is never in any file here.
Without it the server can't connect, and the session hook stays quiet rather
than pointing Claude at a vault it can't reach.

Check with `claude mcp list`: a working server reads
`plugin:pitchstone-memory:pitchstone … ✔ Connected`.

## What it assumes about the vault

```
Memory/
  Projects/<Project>/state.md       ← current truth, rewritten in place
                    /decisions.md   ← append-only, dated
                    /gotchas.md     ← things that bit us
  Patterns/<topic>.md               ← what carries across projects
  Daily/YYYY-MM-DD.md               ← thin journal, optional
```

`<Project>` is the git repository's directory name, so the hook can name the
right paths without being told. The `memory` skill has the reasoning and the
rest of the conventions.

## Permissions

The plugin allows its own seven read-and-append tools without prompting, via a
`PreToolUse` hook — being asked to approve each read would make remembering
something you have to supervise. **`rename_note` and `delete_note` are
deliberately not covered**, so destructive changes to the vault still stop and
ask.

If you would rather grant nothing implicitly, delete the `PreToolUse` block
from `hooks/hooks.json` and put the same list in your own
`~/.claude/settings.json` under `permissions.allow`, as
`mcp__plugin_pitchstone-memory_pitchstone__<tool>`.

## Cloud sessions

A Claude Code web session starts in a fresh container, so nothing installed on
your machine is there. Two things make it work:

1. `PITCHSTONE_TOKEN` as an environment variable on the environment, and a
   network policy that allows `pitchstone.app`.
2. The plugin installed in that container — a setup script running the two
   install commands above, since `enabledPlugins` in a repo's settings enables
   a plugin but does not install it.

A repo that would rather not depend on either can keep its own `.mcp.json`;
that is what Pitchstone itself does.
