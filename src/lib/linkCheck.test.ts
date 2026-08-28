import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findBrokenLinks,
  suggestTargets,
  titleSimilarity,
  type LinkNote,
  type LinkResolver,
  type LinkRow,
} from './linkCheck.ts'
import { matchNotesByTarget, shortestUniqueSuffix } from './markdown/resolve.ts'

const resolve: LinkResolver<LinkNote> = {
  match: matchNotesByTarget,
  qualify: shortestUniqueSuffix,
}

function note(id: string, path: string): LinkNote {
  return { id, path, title: (path.split('/').pop() ?? path).replace(/\.md$/, '') }
}

const welcome = note('1', 'Welcome.md')
const pitchstoneGotchas = note('2', 'Memory/Projects/Pitchstone/gotchas.md')
const dodoGotchas = note('3', 'Memory/Projects/Dodo/gotchas.md')
const notes = [welcome, pitchstoneGotchas, dodoGotchas]

function link(source: string, target: string): LinkRow {
  return { source_note_id: source, target_note_id: null, target_title: target }
}

describe('titleSimilarity', () => {
  it('ignores case and punctuation', () => {
    assert.equal(titleSimilarity('Note-Title', 'note title'), 1)
  })

  it('scores a one-letter typo highly', () => {
    assert.ok(titleSimilarity('Pitchstone', 'Pitchstoen') > 0.7)
  })

  it('scores unrelated titles low', () => {
    assert.ok(titleSimilarity('Welcome', 'Deployment') < 0.5)
  })

  it('scores a contained title below an exact match', () => {
    const contained = titleSimilarity('Ideas', 'Product Ideas')
    assert.ok(contained > 0.7 && contained < 1)
  })
})

describe('suggestTargets', () => {
  it('offers a near-miss, qualified enough to resolve', () => {
    const suggestions = suggestTargets(notes, 'Wellcome', resolve)
    assert.deepEqual(
      suggestions.map((s) => [s.target, s.reason]),
      [['Welcome', 'similar']],
    )
  })

  it('compares the last segment of a qualified target', () => {
    const suggestions = suggestTargets(notes, 'Projects/Welcome', resolve)
    assert.deepEqual(
      suggestions.map((s) => s.note.id),
      [welcome.id],
    )
  })

  it('offers nothing when the vault holds nothing close', () => {
    assert.deepEqual(suggestTargets(notes, 'Quarterly Budget', resolve), [])
  })
})

describe('findBrokenLinks', () => {
  it('reports a link nothing answers to, with a correction', () => {
    const [broken] = findBrokenLinks(notes, [link(welcome.id, 'Wellcome')], resolve)
    assert.equal(broken.kind, 'unresolved')
    assert.equal(broken.target, 'Wellcome')
    assert.equal(broken.source.id, welcome.id)
    assert.deepEqual(
      broken.suggestions.map((s) => s.target),
      ['Welcome'],
    )
  })

  it('reports a shared title as ambiguous, offering every note it could mean', () => {
    const [broken] = findBrokenLinks(notes, [link(welcome.id, 'gotchas')], resolve)
    assert.equal(broken.kind, 'ambiguous')
    assert.deepEqual(
      broken.suggestions.map((s) => [s.target, s.reason]),
      [
        ['Pitchstone/gotchas', 'qualify'],
        ['Dodo/gotchas', 'qualify'],
      ],
    )
  })

  it('leaves a link that resolves today alone, whatever the table says', () => {
    const stale: LinkRow = {
      source_note_id: welcome.id,
      target_note_id: null,
      target_title: 'Pitchstone/gotchas',
    }
    assert.deepEqual(findBrokenLinks(notes, [stale], resolve), [])
  })

  it('reports the same broken target in one note once', () => {
    const rows = [link(welcome.id, 'Missing'), link(welcome.id, 'missing')]
    assert.equal(findBrokenLinks(notes, rows, resolve).length, 1)
  })

  it('reports the same broken target in two notes twice', () => {
    const rows = [link(welcome.id, 'Missing'), link(dodoGotchas.id, 'Missing')]
    assert.equal(findBrokenLinks(notes, rows, resolve).length, 2)
  })

  it('ignores a link whose source note is gone', () => {
    assert.deepEqual(findBrokenLinks(notes, [link('nope', 'Missing')], resolve), [])
  })

  it('sorts by the note the link is in', () => {
    const rows = [link(welcome.id, 'Missing'), link(dodoGotchas.id, 'Missing')]
    assert.deepEqual(
      findBrokenLinks(notes, rows, resolve).map((b) => b.source.path),
      ['Memory/Projects/Dodo/gotchas.md', 'Welcome.md'],
    )
  })
})
