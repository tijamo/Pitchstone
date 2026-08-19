#!/bin/bash
set -euo pipefail

# Only relevant on Claude Code on the web, where each session gets a fresh
# ephemeral local branch checked out before this hook runs. CLAUDE.md says to
# develop directly on main, so sync main from origin and drop that temp branch.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# Don't touch anything if there's already uncommitted work sitting here.
if [ -n "$(git status --porcelain)" ]; then
  echo "session-start: working tree not clean, skipping main sync" >&2
  exit 0
fi

git fetch origin main --quiet || exit 0

temp_branch="$(git branch --show-current)"

if git show-ref --verify --quiet refs/heads/main; then
  git checkout main --quiet
else
  git checkout -b main origin/main --quiet
fi

git merge --ff-only origin/main --quiet || true

# Only delete the temp branch if it has no commits beyond what main now has.
if [ -n "$temp_branch" ] && [ "$temp_branch" != "main" ]; then
  if git merge-base --is-ancestor "$temp_branch" main 2>/dev/null; then
    git branch -D "$temp_branch" >/dev/null 2>&1 || true
  fi
fi
