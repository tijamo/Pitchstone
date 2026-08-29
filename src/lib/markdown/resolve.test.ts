import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  duplicateTitles,
  matchFolderState,
  matchNotesByTarget,
  pathSegments,
  shortestUniqueSuffix,
  targetMatchesNote,
  type NoteRef,
} from './resolve.ts'

const pitchstoneGotchas: NoteRef = { title: 'gotchas', path: 'Memory/Projects/Pitchstone/gotchas.md' }
const dodoGotchas: NoteRef = { title: 'gotchas', path: 'Memory/Projects/Dodo/gotchas.md' }
const welcome: NoteRef = { title: 'Welcome', path: 'Welcome.md' }
const notes = [pitchstoneGotchas, dodoGotchas, welcome]

describe('pathSegments', () => {
  it('splits a path and drops the extension', () => {
    assert.deepEqual(pathSegments('Memory/Projects/Pitchstone/gotchas.md'), [
      'Memory',
      'Projects',
      'Pitchstone',
      'gotchas',
    ])
  })

  it('leaves a top-level note as one segment', () => {
    assert.deepEqual(pathSegments('Welcome.md'), ['Welcome'])
  })
})

describe('targetMatchesNote', () => {
  it('matches a bare word by title, case-insensitively', () => {
    assert.equal(targetMatchesNote('WELCOME', welcome), true)
    assert.equal(targetMatchesNote('gotchas', pitchstoneGotchas), true)
  })

  it('matches a bare word against every note sharing that title', () => {
    assert.equal(targetMatchesNote('gotchas', dodoGotchas), true)
  })

  it('matches a qualified reference only against the note whose path ends that way', () => {
    assert.equal(targetMatchesNote('Pitchstone/gotchas', pitchstoneGotchas), true)
    assert.equal(targetMatchesNote('Pitchstone/gotchas', dodoGotchas), false)
  })

  it('requires a whole path segment, not a mid-name substring', () => {
    // "one/gotchas" must not match ".../someone/gotchas.md" — "some" + "one"
    // is not a folder named "one".
    const someoneGotchas: NoteRef = { title: 'gotchas', path: 'Projects/Someone/gotchas.md' }
    assert.equal(targetMatchesNote('one/gotchas', someoneGotchas), false)
  })

  it('ignores a trailing .md and is case-insensitive on every segment', () => {
    assert.equal(targetMatchesNote('pitchstone/GOTCHAS.md', pitchstoneGotchas), true)
  })

  it('rejects blank input', () => {
    assert.equal(targetMatchesNote('   ', welcome), false)
  })
})

describe('matchNotesByTarget', () => {
  it('returns every note a bare title matches', () => {
    assert.deepEqual(matchNotesByTarget(notes, 'gotchas'), [pitchstoneGotchas, dodoGotchas])
  })

  it('returns exactly one note for a qualified target', () => {
    assert.deepEqual(matchNotesByTarget(notes, 'Dodo/gotchas'), [dodoGotchas])
  })

  it('returns nothing for a target naming no note', () => {
    assert.deepEqual(matchNotesByTarget(notes, 'nothing here'), [])
  })
})

describe('matchFolderState', () => {
  const flowaState: NoteRef = { title: 'state', path: 'Memory/Projects/Flowa/state.md' }
  const withFolder = [...notes, flowaState]

  it('finds a folder’s state.md by its bare name', () => {
    assert.deepEqual(matchFolderState(withFolder, 'Flowa'), [flowaState])
  })

  it('finds it by a qualified reference too', () => {
    assert.deepEqual(matchFolderState(withFolder, 'Projects/Flowa'), [flowaState])
  })

  it('returns nothing for a folder with no state.md', () => {
    assert.deepEqual(matchFolderState(withFolder, 'Welcome'), [])
  })

  it('does not match a note whose own title is “state”', () => {
    assert.deepEqual(matchFolderState(withFolder, 'state'), [])
  })

  it('rejects blank input', () => {
    assert.deepEqual(matchFolderState(withFolder, '  '), [])
  })
})

describe('shortestUniqueSuffix', () => {
  it('is just the title when it is already unique', () => {
    assert.equal(shortestUniqueSuffix(notes, welcome), 'Welcome')
  })

  it('qualifies with one more folder segment when the title collides', () => {
    assert.equal(shortestUniqueSuffix(notes, pitchstoneGotchas), 'Pitchstone/gotchas')
    assert.equal(shortestUniqueSuffix(notes, dodoGotchas), 'Dodo/gotchas')
  })

  it('qualifies further when one extra segment is still not enough', () => {
    const a: NoteRef = { title: 'gotchas', path: 'Work/Alpha/Team/gotchas.md' }
    const b: NoteRef = { title: 'gotchas', path: 'Work/Beta/Team/gotchas.md' }
    assert.equal(shortestUniqueSuffix([a, b], a), 'Alpha/Team/gotchas')
    assert.equal(shortestUniqueSuffix([a, b], b), 'Beta/Team/gotchas')
  })
})

describe('duplicateTitles', () => {
  it('names only titles that occur more than once', () => {
    assert.deepEqual(duplicateTitles(notes), new Set(['gotchas']))
  })

  it('is case-insensitive', () => {
    const upper: NoteRef = { title: 'Gotchas', path: 'Other/Gotchas.md' }
    assert.deepEqual(duplicateTitles([pitchstoneGotchas, upper]), new Set(['gotchas']))
  })

  it('is empty when every title is unique', () => {
    assert.deepEqual(duplicateTitles([welcome, pitchstoneGotchas]), new Set())
  })
})
