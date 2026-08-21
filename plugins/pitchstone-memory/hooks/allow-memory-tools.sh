#!/usr/bin/env bash
# Reading the vault, and appending to it, are what this plugin is for -- being
# asked to approve each one would make remembering something you have to
# supervise. The matcher in hooks.json lists the seven tools this covers;
# rename_note and delete_note are deliberately not among them, so destructive
# changes to the vault still stop and ask.
#
# A plugin cannot ship permission rules, so this is how it carries its own
# posture instead of asking for an entry in settings.json.
set -euo pipefail

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Reading and appending to the vault is what the pitchstone-memory plugin does; renames and deletions still ask."
  }
}
JSON
