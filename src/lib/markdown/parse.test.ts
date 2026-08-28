import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectTags,
  extractHeadings,
  extractLinks,
  extractTags,
  parseFrontmatter,
  replaceLinkTarget,
} from './parse.ts'

describe('extractLinks', () => {
  it('reads a plain wikilink', () => {
    assert.deepEqual(
      extractLinks('see [[Pitchstone]] now').map((l) => [l.target, l.alias, l.type]),
      [['Pitchstone', null, 'wikilink']],
    )
  })

  it('separates an alias from its target', () => {
    assert.deepEqual(
      extractLinks('[[Pitchstone|the app]]').map((l) => [l.target, l.alias]),
      [['Pitchstone', 'the app']],
    )
  })

  it('distinguishes an embed', () => {
    assert.deepEqual(extractLinks('![[Diagram]]').map((l) => l.type), ['embed'])
  })

  it('reads several links from one line', () => {
    assert.deepEqual(extractLinks('[[A]] and [[B]]').map((l) => l.target), ['A', 'B'])
  })

  it('ignores an unclosed link', () => {
    assert.deepEqual(extractLinks('[[Broken'), [])
  })

  it('ignores an empty link', () => {
    assert.deepEqual(extractLinks('[[]]'), [])
  })

  it('does not let an unterminated link swallow the one after it', () => {
    assert.deepEqual(extractLinks('[[Broken and [[Real]]').map((l) => l.target), ['Real'])
  })

  it('reports offsets covering the whole link', () => {
    assert.deepEqual(extractLinks('xx [[A]]').map((l) => [l.from, l.to]), [[3, 8]])
  })
})

describe('extractTags', () => {
  it('reads inline and nested tags', () => {
    assert.deepEqual(extractTags('#alpha and #beta/gamma'), ['alpha', 'beta/gamma'])
  })

  it('deduplicates, ignoring case', () => {
    assert.deepEqual(extractTags('#Alpha #alpha'), ['alpha'])
  })

  it('does not treat an issue number as a tag', () => {
    assert.deepEqual(extractTags('issue #1 today'), [])
  })

  it('does not treat a URL fragment as a tag', () => {
    assert.deepEqual(extractTags('see http://x.com/a#frag'), [])
  })
})

describe('extractHeadings', () => {
  it('reads levels, text, and line numbers', () => {
    assert.deepEqual(
      extractHeadings('# One\n\n## Two\ntext\n### Three').map((h) => [h.level, h.text, h.line]),
      [
        [1, 'One', 1],
        [2, 'Two', 3],
        [3, 'Three', 5],
      ],
    )
  })

  it('ignores a hash inside a fenced code block', () => {
    assert.deepEqual(
      extractHeadings('```\n# not a heading\n```\n# real').map((h) => h.text),
      ['real'],
    )
  })
})

describe('parseFrontmatter', () => {
  it('reads scalars and an inline list', () => {
    assert.deepEqual(parseFrontmatter('---\ntitle: Pitchstone\ntags: [a, b]\n---\nbody').data, {
      title: 'Pitchstone',
      tags: ['a', 'b'],
    })
  })

  it('reads a block list', () => {
    assert.deepEqual(parseFrontmatter('---\ntags:\n  - one\n  - two\n---\n').data, {
      tags: ['one', 'two'],
    })
  })

  it('points bodyFrom at the first line after the fence', () => {
    const note = '---\ntitle: X\n---\nbody'
    assert.equal(note.slice(parseFrontmatter(note).bodyFrom), 'body')
  })

  it('returns nothing for a note without frontmatter', () => {
    assert.deepEqual(parseFrontmatter('# Just a note').data, {})
  })

  it('returns nothing when the block is never closed', () => {
    assert.deepEqual(parseFrontmatter('---\ntitle: X\nbody').data, {})
  })
})

describe('collectTags', () => {
  it('merges frontmatter tags with inline ones', () => {
    assert.deepEqual(collectTags('---\ntags: [alpha]\n---\nbody with #beta'), ['alpha', 'beta'])
  })

  it('does not double-count a tag in both places', () => {
    assert.deepEqual(collectTags('---\ntags: [alpha]\n---\n#alpha again'), ['alpha'])
  })
})

describe('replaceLinkTarget', () => {
  it('retargets a plain link', () => {
    assert.equal(replaceLinkTarget('see [[Wellcome]] first', 'Wellcome', 'Welcome'), 'see [[Welcome]] first')
  })

  it('keeps the alias and the embed marker', () => {
    assert.equal(
      replaceLinkTarget('![[old|shown]]', 'old', 'Folder/new'),
      '![[Folder/new|shown]]',
    )
  })

  it('retargets every occurrence, whatever their case', () => {
    assert.equal(
      replaceLinkTarget('[[gotchas]] and [[Gotchas|them]]', 'gotchas', 'Dodo/gotchas'),
      '[[Dodo/gotchas]] and [[Dodo/gotchas|them]]',
    )
  })

  it('leaves every other link alone, including one that merely starts the same', () => {
    const content = '[[Welcome]] [[old]] [[older]]'
    assert.equal(replaceLinkTarget(content, 'old', 'new'), '[[Welcome]] [[new]] [[older]]')
  })

  it('returns the note unchanged when nothing matches', () => {
    assert.equal(replaceLinkTarget('[[Welcome]]', 'missing', 'new'), '[[Welcome]]')
  })
})
