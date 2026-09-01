---
name: memory
description: How to record and recall work in the Pitchstone vault — the per-project state note that orients a cold session, the individual decision notes and gotchas log beside it, and where cross-project patterns go. Use when writing down what happened or was decided, when opening a session on a project that may already have notes, and whenever reaching for the pitchstone tools to read or write memory.
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
      state.md            ← current truth. Rewritten in place. Read this first.
      <slug>.md           ← one note per decision — what, and why. Dated in
                            its own frontmatter, not in its name.
      gotchas.md          ← things that bit us, and what the fix was
  Patterns/
    <topic>.md            ← what carries across projects, findable by topic
```

**`state.md` is the file that earns its keep.** Stack, deploy targets, table
prefixes, what is done, what is mid-flight, what is blocked. A cold session
reads that one note and is oriented. Everything else is reference, read when
the question calls for it.

This is a read-path decision, not a filing preference. Reconstructing "what is
true about this project" by scanning a hundred dated notes and stitching the
fragments together is slow and lossy — a keyword search across mixed content
misses things. One note that is kept current does not.

## Decisions: one note per decision, not a shared log

As of 2026-08-25, by Tim's direct order, a decision is its own note in the
project's folder — not an entry appended to a shared `decisions.md`. This
replaces the previous append-only-log convention.

**A note's name says what it is; its frontmatter says when it happened.**
Since 2026-09-01, also by Tim's direct order, the date is *not* part of the
filename and the `dcsn-` prefix is gone with it: a name is for identifying a
note, and a date is a fact about it, which is what frontmatter is for.

- **Path**: `Memory/Projects/<Project>/<slug>.md`. `<slug>` is the decision's
  own name, lowercase, hyphenated, no stop-word trimming needed — a few words
  that say what it is (`decisions-become-individual-notes.md`). Make it
  distinctive rather than generic: titles resolve vault-wide, so a slug that
  another project could plausibly use too makes both notes ambiguous to a
  bare `[[wikilink]]`.
- **Date**: a `date: YYYY-MM-DD` key in the note's frontmatter, above `tags`.
  It is the day the decision was made — keep the original date when a decision
  is later split, corrected, or superseded, exactly as the old dated filename
  did.
- **Title**: the note's own `# ` heading is the decision in one line
  (`# Decisions become individual notes`) and carries no date — the
  frontmatter above it already does.
- **Body**: what was decided and why, including approaches rejected and the
  reason. Same content a `decisions.md` entry used to hold — this changes
  where it lives, not what it says.
So a decision note opens like this:

```markdown
---
date: 2026-08-25
tags: [memory, pitchstone, decision]
---

# Decisions become individual notes
```

- **Tag every decision note `[memory, <project-slug>, decision]`** — the
  `decision` tag is what makes `list_tags`/`tag`-filtered `list_notes` able to
  pull every decision across every project in one query, which a shared
  per-project log never supported.
- **Write once.** A decision note is created with `write_note` and normally
  never touched again — unlike the old log, there is nothing to append to.
  If a later decision reverses or refines an earlier one, it gets its own new
  dated note; the old one stays as the record of what was true when it was
  made, exactly like a `state.md` fact that changed does not get its history
  erased, only superseded.
- **Link, don't restate.** If a later decision changes an earlier one,
  `[[wikilink]]` the earlier note rather than repeating its content.

Why: a single per-project `decisions.md` was itself already the second attempt
at this — chosen on 2026-08-21 over a dated cross-project log because
"everything about this project" beats "everything that happened on the 14th"
as a read path. Individual notes keep that project-scoped read path (still
findable by `list_notes` on the project folder, or by the `decision` tag) while
fixing what the shared-log shape cost: a single growing file makes each
decision unlinkable on its own, `write_note`'s no-partial-append behavior means
recording one decision means reading and rewriting every decision that came
before it, and two decisions made close together can only be told apart by
scrolling, not by an address either a `[[wikilink]]` or a backlink can point
at.

## The rule that keeps it honest

**Individual decision notes and gotchas record that something happened.
`state.md` records what is true now.**

Reading only the newest decision notes as gospel is still a trap: a decision
from three weeks ago may have been reversed by one nobody thought to reread.
So:

- When something becomes true, **rewrite `state.md`** — do not leave the old
  claim standing beside the new one.
- When a decision is taken, **write a new `<slug>.md` note** in the project's
  folder, dated in its frontmatter, saying what was decided and why, including
  approaches rejected and the reason — see above.
- When something bites, append it to `gotchas.md` the moment it is learned,
  not at the end of the session. `gotchas.md` is unchanged by this: still one
  growing, append-only file, because a gotcha is usually short and reread as a
  list, not linked to individually.
- Only `state.md` is read by default. If a decision note contradicts it,
  `state.md` wins, and the note is history rather than instruction.

## Cross-project knowledge

Something worked out on one project that applies to another — an RLS pattern, a
deploy quirk, a library's sharp edge — goes in `Memory/Patterns/<topic>.md`,
named for the topic so it is findable by someone who has the problem, not by
someone who remembers the day it was solved.

## Conventions

- **Search before writing.** `search_notes` first: the vault very often already
  knows, and a second note saying the same thing is worse than none. Update the
  note that covers the subject rather than starting a near-duplicate — except
  a decision note, which is written once and left alone (see above).
- **Append with `mode: "append"`** for `gotchas.md` and daily notes only.
  Decision notes are written once with `write_note` and not appended to;
  rewriting `gotchas.md` or a daily note loses everything already in it — a
  daily note in particular may hold another project's entries from earlier the
  same day.
- **Tag every memory note `#memory`** plus a project tag (`#pitchstone`,
  `#dodo`), and decision notes additionally `#decision`. `list_tags` is how a
  cold session finds what is already there.
- **Refer to these notes by full path, never by bare title.** Titles resolve
  vault-wide, so every project has a note titled "state" — `[[state]]` is
  ambiguous and `read_note("state")` is a coin toss. Read
  `Memory/Projects/<Project>/state.md`; link to a project with
  `[[<Project>]]` and let the reader follow the folder. The same applies to
  decision notes now that there are many per project: link by full path
  (`[[Memory/Projects/<Project>/decisions-become-individual-notes]]`), not by
  title alone.
- **Link, don't repeat.** A daily entry says what happened and links out; the
  project's notes carry the settled version.

## When to write

- **Opening**: `vault_info`, then read `Memory/Projects/<Project>/state.md`
  before building anything, and `search_notes` for the specific task.
- **The moment something is learned the hard way** — the gotcha, the dead end,
  the decision and its reason.
- **Closing**: update `state.md` if what is true has changed. Write a new
  decision note or append to `gotchas.md` if there was one.

## What does not belong here

Facts about the *code* — conventions, architecture, build gotchas — belong in
the project's `CLAUDE.md`, where they are reviewed in a diff and read before
anything is touched. The vault is for facts about the *work*: what is true now,
what was decided and why, and anything that shouldn't live in a public repo.
