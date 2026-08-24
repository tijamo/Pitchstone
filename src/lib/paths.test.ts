import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTree, type TreeFile, type TreeFolder, type TreeNode } from './paths.ts'
import { matchNotesByTarget } from './markdown/resolve.ts'

type FakeNote = { path: string; title: string; parent?: string | null }

function note(path: string, parent?: string | null): FakeNote {
  const title = (path.split('/').pop() ?? path).replace(/\.md$/, '')
  return parent === undefined ? { path, title } : { path, title, parent }
}

function tree(notes: FakeNote[]): TreeNode<FakeNote>[] {
  return buildTree(notes, matchNotesByTarget)
}

function names(nodes: TreeNode<FakeNote>[]): string[] {
  return nodes.map((n) => n.name)
}

function fileNode(nodes: TreeNode<FakeNote>[], name: string): TreeFile<FakeNote> {
  const found = nodes.find((n) => n.name === name)
  assert.ok(found && found.kind === 'file', `expected a file node named ${name}`)
  return found as TreeFile<FakeNote>
}

function folderNode(nodes: TreeNode<FakeNote>[], name: string): TreeFolder<FakeNote> {
  const found = nodes.find((n) => n.name === name)
  assert.ok(found && found.kind === 'folder', `expected a folder node named ${name}`)
  return found as TreeFolder<FakeNote>
}

describe('buildTree — folders only (no parent frontmatter)', () => {
  it('groups notes by path into folders, folders before files', () => {
    const t = tree([note('B.md'), note('Projects/A.md'), note('A.md')])
    assert.deepEqual(names(t), ['Projects', 'A', 'B'])
    assert.deepEqual(names(folderNode(t, 'Projects').children), ['A'])
  })
})

describe('buildTree — parent nesting', () => {
  it('nests a note under the note its parent frontmatter names', () => {
    const t = tree([note('My Notes.md'), note('Thoughts.md', 'My Notes')])
    assert.deepEqual(names(t), ['My Notes'])
    assert.deepEqual(names(fileNode(t, 'My Notes').children), ['Thoughts'])
  })

  it('removes a folder left with nothing in it after its note is reparented', () => {
    const t = tree([note('Hub.md'), note('Sub/Child.md', 'Hub')])
    assert.deepEqual(names(t), ['Hub'])
    assert.deepEqual(names(fileNode(t, 'Hub').children), ['Child'])
  })

  it('leaves a sibling in its folder when only one of two notes there is reparented', () => {
    const t = tree([note('Hub.md'), note('Sub/Child.md', 'Hub'), note('Sub/Other.md')])
    assert.deepEqual(names(fileNode(t, 'Hub').children), ['Child'])
    assert.deepEqual(names(folderNode(t, 'Sub').children), ['Other'])
  })

  it('nests multiple levels deep, moving a whole subtree with its middle note', () => {
    const t = tree([
      note('Grandparent.md'),
      note('Parent.md', 'Grandparent'),
      note('Child.md', 'Parent'),
    ])
    const grandparent = fileNode(t, 'Grandparent')
    assert.deepEqual(names(grandparent.children), ['Parent'])
    assert.deepEqual(names(fileNode(grandparent.children, 'Parent').children), ['Child'])
  })

  it('resolves a parent by qualified path when the bare title is ambiguous', () => {
    const t = tree([note('A/Hub.md'), note('B/Hub.md'), note('Child.md', 'A/Hub')])
    assert.deepEqual(names(fileNode(folderNode(t, 'A').children, 'Hub').children), ['Child'])
    assert.deepEqual(names(folderNode(t, 'B').children), ['Hub'])
  })

  it('ignores a parent that names no note, leaving it in its folder position', () => {
    const t = tree([note('Orphan.md', 'Nothing Here')])
    assert.deepEqual(names(t), ['Orphan'])
  })

  it('ignores a parent that names more than one note', () => {
    const t = tree([note('A/Dup.md'), note('B/Dup.md'), note('Child.md', 'Dup')])
    assert.deepEqual(names(t), ['A', 'B', 'Child'])
  })

  it('ignores a note naming itself as its own parent', () => {
    const t = tree([note('Self.md', 'Self')])
    assert.deepEqual(names(t), ['Self'])
  })

  it('ignores a two-note cycle, leaving both in their folder positions', () => {
    const t = tree([note('A.md', 'B'), note('B.md', 'A')])
    assert.deepEqual(names(t), ['A', 'B'])
  })

  it('ignores a longer cycle the same way', () => {
    const t = tree([note('A.md', 'C'), note('B.md', 'A'), note('C.md', 'B')])
    assert.deepEqual(names(t), ['A', 'B', 'C'])
  })
})
