#!/usr/bin/env bash
# Names this project's memory notes at the top of every session, so
# remembering is a habit rather than something to be prompted for. Stdout from
# a SessionStart hook is added to the session as context.
#
# Silent when there is no token: without one the pitchstone tools cannot
# connect, and telling Claude to use a vault it cannot reach is worse than
# saying nothing.
set -euo pipefail

[ -n "${PITCHSTONE_TOKEN:-}" ] || exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
project="$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")"

cat <<TEXT
Your memory for this and every project is the Pitchstone vault, through the
\`pitchstone\` MCP tools. For this project:

- **Read \`Memory/Projects/${project}/state.md\` before building anything.** It
  is what is true now — stack, deploy targets, what is done, what is
  mid-flight, what is blocked — and it is kept current by rewriting it in
  place, not by appending.
- Decisions are one note per decision — \`Memory/Projects/${project}/dcsn-YYYY-MM-DD-<slug>.md\`,
  tagged \`decision\` — not a shared log; \`gotchas.md\` beside them is still one
  append-only file. Both are history: read them when a question calls for one,
  and where they contradict \`state.md\`, \`state.md\` is right.
- Something that carries across projects goes in \`Memory/Patterns/<topic>.md\`,
  named for the topic rather than the day.
- Open with \`vault_info\` and a \`search_notes\` for the task — the vault very
  often already knows. Close by updating \`state.md\` if what is true changed,
  and appending the decision or the gotcha if there was one.

The \`memory\` skill has the full conventions.
TEXT
