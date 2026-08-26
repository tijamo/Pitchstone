import { useMemo, useState } from 'react'
import { buildTree, folderGraphId, type TreeNode } from '../lib/paths'
import { useVaultStore } from '../store/vaultStore'
import { useUiStore } from '../store/uiStore'
import type { NoteMeta } from '../lib/notes'
import { matchNotesByTarget } from '../lib/markdown/resolve'
import { Icon } from './Icon'

export function FileTree() {
  const notes = useVaultStore((s) => s.notes)
  const tree = useMemo(() => buildTree(notes, matchNotesByTarget), [notes])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <ul className="tree" role="tree">
      {tree.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </ul>
  )
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: TreeNode<NoteMeta>
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
}) {
  const activeId = useVaultStore((s) => s.activeId)
  const renamingId = useVaultStore((s) => s.renamingId)
  const open = useVaultStore((s) => s.open)
  const rename = useVaultStore((s) => s.rename)
  const remove = useVaultStore((s) => s.remove)
  const setRenaming = useVaultStore((s) => s.setRenaming)
  const create = useVaultStore((s) => s.create)
  const focusGraph = useUiStore((s) => s.focusGraph)

  const indent = { paddingLeft: 6 + depth * 14 }

  if (node.kind === 'folder') {
    const isCollapsed = collapsed.has(node.path)
    const isActive = node.note?.id === activeId
    return (
      <li role="treeitem" aria-expanded={!isCollapsed}>
        <div className={`tree__row tree__row--folder${isActive ? ' tree__row--active' : ''}`} style={indent}>
          <button
            className="tree__label"
            onClick={() => {
              onToggle(node.path)
              // A folder with its own note (see paths.ts's folderNotePath)
              // opens like any other note; either way it's still a real node
              // in the graph — see GraphView's focus mode.
              if (node.note) {
                void open(node.note.id)
                focusGraph(node.note.id)
              } else {
                focusGraph(folderGraphId(node.path))
              }
            }}
            title={node.path}
          >
            <span className={`tree__chevron${isCollapsed ? '' : ' tree__chevron--open'}`}>
              ▸
            </span>
            <span className="tree__name">{node.name}</span>
          </button>
          <button
            className="tree__action"
            title={`New note in ${node.name}`}
            aria-label={`New note in ${node.name}`}
            onClick={() => void create(node.path)}
          >
            <Icon name="file-plus" size={13} />
          </button>
        </div>

        {!isCollapsed && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const isActive = node.note.id === activeId
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.path)

  if (node.note.id === renamingId) {
    return (
      <li role="treeitem" aria-selected={isActive}>
        <div className="tree__row" style={indent}>
          <input
            className="tree__rename"
            defaultValue={node.name}
            autoFocus
            onFocus={(e) => e.target.select()}
            onBlur={(e) => void rename(node.note.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                // Reset first so the blur handler sees the original name.
                e.currentTarget.value = node.name
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      </li>
    )
  }

  return (
    <li role="treeitem" aria-selected={isActive} aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        className={`tree__row${isActive ? ' tree__row--active' : ''}`}
        style={indent}
      >
        <button
          className="tree__label"
          onClick={() => {
            void open(node.note.id)
            // Selecting a note here is a deliberate "look at this one" action,
            // so the graph follows it into a branching view centred on it —
            // see GraphView's own focus mode.
            focusGraph(node.note.id)
            // A note with its own nested notes toggles open the same click
            // that opens it — there is no separate row just for the chevron.
            if (hasChildren) onToggle(node.path)
          }}
          onDoubleClick={() => setRenaming(node.note.id)}
          title={node.path}
        >
          {hasChildren && (
            <span className={`tree__chevron${isCollapsed ? '' : ' tree__chevron--open'}`}>
              ▸
            </span>
          )}
          <span className="tree__name">{node.name}</span>
        </button>
        <button
          className="tree__action"
          title="Rename (or move, by typing a path)"
          aria-label={`Rename ${node.name}`}
          onClick={() => setRenaming(node.note.id)}
        >
          <Icon name="pencil" size={13} />
        </button>
        <button
          className="tree__action tree__action--danger"
          title="Delete"
          aria-label={`Delete ${node.name}`}
          onClick={() => {
            if (confirm(`Delete "${node.name}"? This cannot be undone.`)) {
              void remove(node.note.id)
            }
          }}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>

      {hasChildren && !isCollapsed && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
