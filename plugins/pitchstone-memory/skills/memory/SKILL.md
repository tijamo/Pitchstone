---
name: memory
description: How to record and recall work in the Pitchstone vault — the per-project state note that orients a cold session, the dated logs beside it, and where cross-project patterns go. Use when writing down what happened or was decided, when opening a session on a project that may already have notes, and whenever reaching for the pitchstone tools to read or write memory.
---

# Pitchstone as memory

The vault is a set of linked markdown notes at https://pitchstone.app, reached
through the `pitchstone` MCP tools. It is the memory that outlives a session —
prefer it to a scratch file for anything worth having tomorrow.

## The shape

```
Memory/
  Projects/
    <Project>/
      state.md      ← current truth. Rewritten in place. Read this first.
      decisions.md  ← append-only, dated: that a decision was taken, and why
      gotchas.md    ← things that bit us, and what the fix was
  Patterns/
    <topic>.md      ← what carries across projects, findable by topic
  Daily/
    YYYY-MM-DD.md   ← thin journal, links out. Optional.
```

**`state.md` is the file that earns its keep.** Stack, deploy targets, table
prefixes, what is done, what is mid-flight, what is blocked. A cold session
reads that one note and is oriented. Everything else is reference, read when
the question calls for it.

This is a read-path decision, not a filing preference. Reconstructing "what is
true about this project" by scanning a hundred dated notes and stitching the
fragments together is slow and lossy — a keyword search across mixed content
misses things. One note that is kept current does not.

## The rule that keeps it honest

**Logs record that a decision happened. `state.md` records what is true now.**

An append-only log read on its own is a trap: a decision from three weeks ago
says "we are using X", and X was ripped out last week. So:

- When something becomes true, **rewrite `state.md`** — do not append to it,
  and do not leave the old claim standing beside the new one.
- When a decision is taken, append a dated entry to `decisions.md` saying what
  was decided and why, including approaches rejected and the reason.
- When something bites, append it to `gotchas.md` the moment it is learned,
  not at the end of the session.
- Only `state.md` is read by default. If a log contradicts it, `state.md` wins,
  and the log is history rather than instruction.

## Cross-project knowledge

Something worked out on one project that applies to another — an RLS pattern, a
deploy quirk, a library's sharp edge — goes in `Memory/Patterns/<topic>.md`,
named for the topic so it is findable by someone who has the problem, not by
someone who remembers the day it was solved.

## Conventions

- **Search before writing.** `search_notes` first: the vault very often already
  knows, and a second note saying the same thing is worse than none. Update the
  note that covers the subject rather than starting a near-duplicate.
- **Append with `mode: "append"`** for `decisions.md`, `gotchas.md`, and daily
  notes. Rewriting one loses everything already in it — a daily note in
  particular may hold another project's entries from earlier the same day.
- **Tag every memory note `#memory`** plus a project tag (`#pitchstone`,
  `#dodo`). `list_tags` is how a cold session finds what is already there.
- **Refer to these notes by full path, never by bare title.** Titles resolve
  vault-wide, so every project has a note titled "state" — `[[state]]` is
  ambiguous and `read_note("state")` is a coin toss. Read
  `Memory/Projects/<Project>/state.md`; link to a project with
  `[[<Project>]]` and let the reader follow the folder.
- **Link, don't repeat.** A daily entry says what happened and links out; the
  project's notes carry the settled version.

## When to write

- **Opening**: `vault_info`, then read `Memory/Projects/<Project>/state.md`
  before building anything, and `search_notes` for the specific task.
- **The moment something is learned the hard way** — the gotcha, the dead end,
  the decision and its reason.
- **Closing**: update `state.md` if what is true has changed. Append the
  decision or the gotcha if there was one. A daily entry is optional and is for
  the human, not for orientation.

## What does not belong here

Facts about the *code* — conventions, architecture, build gotchas — belong in
the project's `CLAUDE.md`, where they are reviewed in a diff and read before
anything is touched. The vault is for facts about the *work*: what is true now,
what was decided and why, and anything that shouldn't live in a public repo.
