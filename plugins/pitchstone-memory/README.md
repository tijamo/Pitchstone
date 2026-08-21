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

From inside a Claude Code session, typed at the prompt:

```
/plugin marketplace add tijamo/Pitchstone
/plugin install pitchstone-memory@tijamo
```

`/plugin` on its own opens the plugin manager instead. The same commands work
as `claude plugin …` in a shell, and the Claude desktop app has a plugin
browser under the **+** button beside the prompt → **Plugins** → **Add
plugin**.

**Or skip installing entirely.** A folder under a skills directory that
contains `.claude-plugin/plugin.json` is loaded as a plugin in its own right,
with no marketplace and no install step:

```bash
cp -R plugins/pitchstone-memory ~/.claude/skills/
```

It loads next session as `pitchstone-memory@skills-dir`, in every project,
and updates when you replace the folder. `/reload-plugins` picks up changes to
anything other than a skill's own text without a restart.

Either way, the token:

```bash
export PITCHSTONE_TOKEN=…   # add to ~/.zshrc
```

The token is made in the app under **Settings → Claude access** and shown
once — only its hash is stored. `${PITCHSTONE_TOKEN}` is expanded in the
plugin's MCP config at launch, so the token itself is never in any file here.
Without it the server can't connect, and the session hook stays quiet rather
than pointing Claude at a vault it can't reach.

Check with `/mcp` in a session, or `claude mcp list` in a shell: a working
server reads `plugin:pitchstone-memory:pitchstone … ✔ Connected`.

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
your machine is there — user-scoped `enabledPlugins` included. What reaches it
is the repository. Declare the marketplace and the plugin in the repo's
`.claude/settings.json` and the plugin is **installed at session start**, given
an environment whose network policy can reach GitHub:

```json
{
  "extraKnownMarketplaces": {
    "tijamo": { "source": { "source": "github", "repo": "tijamo/Pitchstone" } }
  },
  "enabledPlugins": { "pitchstone-memory@tijamo": true }
}
```

The environment still needs `PITCHSTONE_TOKEN` as an environment variable and
`pitchstone.app` allowed by its network policy.

Don't do this in Pitchstone's own repo: it already carries a `pitchstone`
server in `.mcp.json`, and the plugin's copy is a second server under a
different name, so every tool would appear twice.
