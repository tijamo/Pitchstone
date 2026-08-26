import { useEffect, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { useVaultStore } from '../store/vaultStore'
import { useUiStore } from '../store/uiStore'
import { listLinks } from '../lib/notes'
import type { NoteMeta } from '../lib/notes'
import { matchNotesByTarget } from '../lib/markdown/resolve'
import { basename, dirname, folderGraphId, folderNotePath } from '../lib/paths'
import { Icon } from './Icon'

type GraphNode = SimulationNodeDatum & {
  id: string
  title: string
  degree: number
  /** A link target that no note answers to yet — drawn hollow. */
  unresolved: boolean
  /** A link target more than one note answers to — drawn hollow, differently. */
  ambiguous: boolean
  /** A pseudo-node standing for a vault folder, not a note — see paths.ts. */
  folder: boolean
  /** A real note's or folder's vault-relative path, for the hover tooltip.
   * Absent for an unresolved/ambiguous placeholder — it doesn't have one. */
  path?: string
  /** The folder's own note (see paths.ts's folderNotePath), if it has one —
   * lets a folder node open and highlight like a note while still drawing
   * with the folder's own square icon. Only ever set when folder is true. */
  noteId?: string
}
type GraphLink = SimulationLinkDatum<GraphNode> & {
  /** A note-in-folder or folder-in-folder edge, not a [[wikilink]] — drawn
   * dashed so containment reads differently from an actual link. */
  structural?: boolean
}

const FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
/** How long the pointer has to sit still on a node before its path shows. */
const HOVER_DELAY = 500
/** How long a touch has to hold still on a node before it starts dragging it
 * — below this, lifting the finger is a tap that opens the note instead. */
const TOUCH_LONG_PRESS_MS = 450
/** How far a touch can slide before the hold fires before it's read as a pan
 * rather than an attempt to tap or hold the node underneath it. */
const TOUCH_MOVE_CANCEL_PX = 10

/**
 * Node labels are clipped to a share of the panel rather than drawn at full
 * length: the graph shares a sidebar now, and an untruncated title runs off
 * the edge mid-word. Measuring is cached because this runs per node per tick.
 */
function fitLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  cache: Map<string, string>,
): string {
  const key = `${maxWidth}:${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let label = text
  if (ctx.measureText(text).width > maxWidth) {
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid
      else hi = mid - 1
    }
    label = lo > 0 ? `${text.slice(0, lo)}…` : ''
  }
  cache.set(key, label)
  return label
}

/**
 * The focused view rooted at `rootId`. For a note (or an unresolved/ambiguous
 * placeholder), it's a spanning tree radiating outward with no cross-links
 * between branches — found by a plain BFS over the link graph, where the
 * first edge to reach a node is the only one kept, so two branches that both
 * lead to the same note never draw a connecting edge between them. Folder
 * containment plays no part here: it groups notes by where they live, not by
 * what they mean to each other, so it isn't a "branch" in this sense.
 *
 * For a folder, it's a different shape on purpose: every node shown has to
 * belong to that project, so containment (recursive, through sub-folders) is
 * how its membership is found, and a [[wikilink]] only ever draws an edge
 * between two notes already in that set — never followed out of it to
 * whatever it happens to point at elsewhere in the vault. That can leave
 * cross-links standing (two notes in the same project linking to a third),
 * which is fine: unlike the note case, every node on screen is already
 * guaranteed to belong here, so there is nothing for pruning to protect.
 */
function buildFocusTree(
  nodes: GraphNode[],
  links: GraphLink[],
  rootId: string,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const idOf = (end: GraphNode | string) => (typeof end === 'string' ? end : end.id)

  if (byId.get(rootId)?.folder) {
    // A containment edge points child -> its folder (see the note/folder
    // links built above), so a folder's own contents are found by walking
    // those edges backwards: everything whose edge targets this folder.
    const childrenOf = new Map<string, { link: GraphLink; otherId: string }[]>()
    for (const link of links) {
      if (!link.structural) continue
      const s = idOf(link.source as GraphNode | string)
      const t = idOf(link.target as GraphNode | string)
      if (!childrenOf.has(t)) childrenOf.set(t, [])
      childrenOf.get(t)!.push({ link, otherId: s })
    }
    const visited = new Set([rootId])
    const treeLinks: GraphLink[] = []
    const queue = [rootId]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const { link, otherId } of childrenOf.get(current) ?? []) {
        if (visited.has(otherId)) continue
        visited.add(otherId)
        treeLinks.push(link)
        queue.push(otherId)
      }
    }
    // Every [[wikilink]] with both ends already inside the project is real
    // signal about how its notes relate; one that reaches outside it would
    // pull in a node that doesn't belong to this project, so it's dropped
    // rather than followed.
    for (const link of links) {
      if (link.structural) continue
      const s = idOf(link.source as GraphNode | string)
      const t = idOf(link.target as GraphNode | string)
      if (visited.has(s) && visited.has(t)) treeLinks.push(link)
    }
    return { nodes: nodes.filter((n) => visited.has(n.id)), links: treeLinks }
  }

  const adjacency = new Map<string, { link: GraphLink; otherId: string }[]>()
  for (const link of links) {
    if (link.structural) continue
    const s = idOf(link.source as GraphNode | string)
    const t = idOf(link.target as GraphNode | string)
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push({ link, otherId: t })
    adjacency.get(t)!.push({ link, otherId: s })
  }

  const visited = new Set([rootId])
  const treeLinks: GraphLink[] = []
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const { link, otherId } of adjacency.get(current) ?? []) {
      if (visited.has(otherId)) continue
      visited.add(otherId)
      treeLinks.push(link)
      queue.push(otherId)
    }
  }

  return { nodes: nodes.filter((n) => visited.has(n.id)), links: treeLinks }
}

export function GraphView() {
  const notes = useVaultStore((s) => s.notes)

  if (notes.length === 0) {
    return (
      <div className="empty empty--pane">
        <span className="empty__title">Nothing to plot</span>
        <span className="empty__hint">
          Once notes link to each other, the graph shows how they connect.
        </span>
      </div>
    )
  }

  return <GraphCanvas notes={notes} />
}

function GraphCanvas({ notes }: { notes: NoteMeta[] }) {
  const activeId = useVaultStore((s) => s.activeId)
  const open = useVaultStore((s) => s.open)
  const openOrCreate = useVaultStore((s) => s.openOrCreate)
  const linksVersion = useVaultStore((s) => s.linksVersion)
  const graphFocus = useUiStore((s) => s.graphFocus)
  const graphFocusId = useUiStore((s) => s.graphFocusId)
  const setGraphFocus = useUiStore((s) => s.setGraphFocus)

  // Which node the focused view is rooted at, only while focus mode is on.
  // graphFocusId is an explicit choice — set by double-clicking a node here,
  // or by selecting a note or folder in the file tree — and it can name a
  // folder or an unresolved link that vaultStore has no "active" concept of
  // at all. Falling back to the open note only covers the plain case: the
  // crosshair toggle turned on with nothing explicitly focused yet.
  const focusRoot = graphFocus ? (graphFocusId ?? activeId) : null

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const focusRootRef = useRef(focusRoot)
  focusRootRef.current = focusRoot

  // The full graph, as fetched — nodesRef/linksRef below are what's actually
  // laid out and drawn, which is this filtered down to the focus tree when
  // focus mode is on.
  const allNodesRef = useRef<GraphNode[]>([])
  const allLinksRef = useRef<GraphLink[]>([])
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const dragRef = useRef<{ node: GraphNode; moved: boolean } | null>(null)
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  // A touch that landed on a node but hasn't yet been classified as a tap, a
  // hold-to-drag, or a slide-into-pan — see handlePointerDown/Move/Up.
  const pendingTouchRef = useRef<{ node: GraphNode; startX: number; startY: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Every touch currently down, by pointer id — a second one landing turns
  // whatever single-touch gesture was in flight into a pinch instead.
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  // Re-applies the current focus filter to the already-fetched graph and
  // restarts the simulation, without a network round trip — set once the
  // main effect below has fetched something to filter.
  const applyLayoutRef = useRef<((alpha?: number) => void) | null>(null)

  // The hover-dwell tooltip: a node's path, shown once the pointer has sat
  // on it a moment rather than the instant it passes over — a graph this
  // dense would otherwise flash a label on every node the cursor crosses.
  // Its own panel clips overflow (.sidebar), and the panel can be as narrow
  // as 180px, so position and width are both clamped to the panel's actual
  // room rather than just offset from the cursor — a fixed-width tooltip
  // that assumed a wide panel would get silently cut off in a narrow one.
  const [tooltip, setTooltip] = useState<{
    text: string
    left: number
    top: number
    maxWidth: number
  } | null>(null)
  const hoveredIdRef = useRef<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The hovered node's direct neighbors — everything else gets dimmed on
  // draw, since a dense graph's edges are otherwise indistinguishable from
  // one another once more than a handful cross the same area.
  const hoverNeighborsRef = useRef<Set<string>>(new Set())

  const noteIds = notes
    .map((n) => n.id)
    .sort()
    .join(',')

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!container || !canvas || !ctx) return

    let cancelled = false
    const labelCache = new Map<string, string>()

    function project(x: number, y: number) {
      const t = transformRef.current
      return { x: x * t.k + t.x, y: y * t.k + t.y }
    }

    function radiusOf(node: GraphNode) {
      const scale = Math.min(transformRef.current.k, 1.4)
      // Folders are context for the notes inside them, not hubs in their own
      // right, so they stay small regardless of how many children they have.
      if (node.folder) return (3 + Math.min(node.degree, 4)) * scale
      return (4 + Math.min(node.degree, 8)) * scale
    }

    function nodeAt(sx: number, sy: number): GraphNode | null {
      let found: GraphNode | null = null
      let best = Infinity
      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue
        const p = project(node.x, node.y)
        const d = Math.hypot(p.x - sx, p.y - sy)
        if (d <= radiusOf(node) + 3 && d < best) {
          best = d
          found = node
        }
      }
      return found
    }

    function draw() {
      const { width, height } = sizeRef.current
      ctx!.clearRect(0, 0, width, height)

      const styles = getComputedStyle(container!)
      const lineColor = styles.getPropertyValue('--border-strong').trim()
      const nodeColor = styles.getPropertyValue('--text-faint').trim()
      const labelColor = styles.getPropertyValue('--text-muted').trim()
      const accent = styles.getPropertyValue('--accent').trim()
      const unresolvedColor = styles.getPropertyValue('--link-unresolved').trim()
      const ambiguousColor = styles.getPropertyValue('--link-ambiguous').trim()

      const structuralColor = styles.getPropertyValue('--border').trim()
      // While a node is hovered, everything not directly touching it fades:
      // a graph of any real size has edges crossing all over the canvas, and
      // without this there is no way to tell which lines belong to which
      // node once more than a few are on screen at once.
      const hoverId = hoveredIdRef.current
      const neighbors = hoverNeighborsRef.current
      ctx!.lineWidth = 1
      for (const link of linksRef.current) {
        const s = link.source as GraphNode
        const t = link.target as GraphNode
        if (s.x == null || t.x == null || s.y == null || t.y == null) continue
        const p1 = project(s.x, s.y)
        const p2 = project(t.x, t.y)
        ctx!.globalAlpha = hoverId != null && s.id !== hoverId && t.id !== hoverId ? 0.15 : 1
        ctx!.strokeStyle = link.structural ? structuralColor : lineColor
        ctx!.setLineDash(link.structural ? [3, 3] : [])
        ctx!.beginPath()
        ctx!.moveTo(p1.x, p1.y)
        ctx!.lineTo(p2.x, p2.y)
        ctx!.stroke()
      }
      ctx!.setLineDash([])
      ctx!.globalAlpha = 1

      ctx!.font = FONT
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'top'
      // Rounded to a step so a drag-resize reuses cache entries instead of
      // measuring every title afresh at every intermediate pixel width.
      const maxLabel = Math.max(60, Math.round((width * 0.4) / 20) * 20)
      // A note's label fades out below the graph's default zoom, so a
      // zoomed-out, crowded vault reads as nodes and edges rather than a wall
      // of overlapping text — 1 at the default zoom and above, down to fully
      // gone at MIN_ZOOM. Folders are exempt: there are far fewer of them,
      // they don't crowd the way note labels do, and they're what orients a
      // zoomed-out view in the first place.
      const labelZoomFade = Math.min(1, Math.max(0, (transformRef.current.k - MIN_ZOOM) / (1 - MIN_ZOOM)))
      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue
        const p = project(node.x, node.y)
        const r = radiusOf(node)
        const isActive = node.folder
          ? node.noteId != null && node.noteId === activeIdRef.current
          : node.id === activeIdRef.current
        const dimmed = hoverId != null && node.id !== hoverId && !neighbors.has(node.id)
        ctx!.globalAlpha = dimmed ? 0.25 : 1

        ctx!.beginPath()
        if (node.folder) {
          // A square, not a circle: a folder is a place notes sit in, not a
          // note itself, so it reads as a different kind of thing at a glance
          // — even one with its own note (see paths.ts's folderNotePath)
          // keeps this shape, and only picks up the active note's color.
          ctx!.rect(p.x - r, p.y - r, r * 2, r * 2)
          ctx!.strokeStyle = isActive ? accent : nodeColor
          ctx!.stroke()
        } else {
          ctx!.arc(p.x, p.y, r, 0, Math.PI * 2)
          if (node.unresolved) {
            // Hollow, the way an unresolved or ambiguous wikilink reads in the
            // editor: named but not yet written, or named by more than one note.
            ctx!.strokeStyle = node.ambiguous ? ambiguousColor : unresolvedColor
            ctx!.lineWidth = 1.5
            ctx!.stroke()
            ctx!.lineWidth = 1
          } else {
            ctx!.fillStyle = isActive ? accent : nodeColor
            ctx!.fill()
          }
        }

        ctx!.fillStyle = node.folder
          ? isActive
            ? accent
            : nodeColor
          : node.unresolved
            ? node.ambiguous
              ? ambiguousColor
              : unresolvedColor
            : isActive
              ? accent
              : labelColor
        ctx!.globalAlpha = node.folder ? ctx!.globalAlpha : (dimmed ? 0.25 : 1) * labelZoomFade
        ctx!.fillText(fitLabel(ctx!, node.title, maxLabel, labelCache), p.x, p.y + r + 4)
      }
      ctx!.globalAlpha = 1
    }

    function resize() {
      const width = container!.clientWidth
      const height = container!.clientHeight
      sizeRef.current = { width, height }
      const dpr = window.devicePixelRatio || 1
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    // Applies the current focus root (a ref, so this always sees the latest
    // value without needing to be redeclared) to whatever was last fetched,
    // and (re)starts the simulation. Called after every fetch, and by the
    // separate focus-only effect below when just the root changes.
    function applyLayout(alpha = 1) {
      const all = allNodesRef.current
      if (all.length === 0) return

      // Node membership and positions are both about to change under it.
      clearHover()

      const root = focusRootRef.current
      const rootNode = root ? all.find((n) => n.id === root) : undefined
      const { nodes: simNodes, links: simLinks } = rootNode
        ? buildFocusTree(all, allLinksRef.current, rootNode.id)
        : { nodes: all, links: allLinksRef.current }

      nodesRef.current = simNodes
      linksRef.current = simLinks

      const { width, height } = sizeRef.current
      simRef.current?.stop()
      simRef.current = forceSimulation(simNodes)
        // Repulsion grows with node count so a bigger vault settles at the
        // same visual density as a small one — a flat strength just lets
        // more nodes crowd the same canvas, which is what was reading as
        // edges piling on top of each other as the graph grew.
        .force('charge', forceManyBody().strength(-100 - Math.min(400, simNodes.length * 3)))
        .force(
          'link',
          forceLink<GraphNode, GraphLink>(simLinks)
            .id((d) => d.id)
            // Folder containment is a looser relationship than a wikilink, so
            // it gets more room rather than crowding notes into their folder.
            .distance((l) => (l.structural ? 70 : 56)),
        )
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide<GraphNode>((d) => radiusOf(d) + 6))
        .on('tick', draw)
        .alpha(alpha)
        .restart()

      resize()
    }
    applyLayoutRef.current = applyLayout

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    listLinks().then((edges) => {
      if (cancelled) return

      // A link whose target does not exist yet still belongs on the graph —
      // that is why the schema keeps it. Every such link naming the same title
      // shares one placeholder node, keyed by the title rather than an id.
      const placeholderId = (title: string) => `unresolved:${title.toLowerCase()}`
      const byNoteId = new Map(notes.map((n) => [n.id, n]))
      const byPath = new Map(notes.map((n) => [n.path, n]))

      const endpoints = edges
        .filter((e) => byNoteId.has(e.source_note_id))
        .map((e) => ({
          from: e.source_note_id,
          to: e.target_note_id ?? placeholderId(e.target_title),
          title: e.target_title,
          resolved: e.target_note_id != null,
        }))
        // A link out to a note that has since been deleted resolves to
        // nothing and names nothing useful; drop it rather than plot it.
        .filter((e) => !e.resolved || byNoteId.has(e.to))

      const degree = new Map<string, number>()
      for (const e of endpoints) {
        degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
        degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
      }

      const nodes: GraphNode[] = notes.map((n) => ({
        id: n.id,
        title: n.title,
        degree: degree.get(n.id) ?? 0,
        unresolved: false,
        ambiguous: false,
        folder: false,
        path: n.path,
      }))
      const seen = new Set(nodes.map((n) => n.id))
      for (const e of endpoints) {
        if (e.resolved || seen.has(e.to)) continue
        seen.add(e.to)
        nodes.push({
          id: e.to,
          title: e.title,
          degree: degree.get(e.to) ?? 0,
          unresolved: true,
          // A name more than one note answers to needs qualifying, not
          // creating — the placeholder is not "unwritten" the way a genuinely
          // absent title is.
          ambiguous: matchNotesByTarget(notes, e.title).length > 1,
          folder: false,
        })
      }

      const links: GraphLink[] = endpoints.map((e) => ({ source: e.from, target: e.to }))

      // The vault's folders are never stored (paths.ts), so they are rebuilt
      // here from note paths on every layout: one pseudo-node per folder, an
      // edge from each note to the folder it sits in, and from each folder to
      // its own parent. That gives notes with no [[wikilink]] between them —
      // most of what sits under Memory/Projects/<Project>/, for instance — a
      // reason to sit near each other on the graph anyway.
      const folderNodes = new Map<string, GraphNode>()
      function ensureFolder(path: string): GraphNode {
        const existing = folderNodes.get(path)
        if (existing) return existing
        const created: GraphNode = {
          id: folderGraphId(path),
          title: basename(path),
          degree: 0,
          unresolved: false,
          ambiguous: false,
          folder: true,
          path,
          noteId: byPath.get(folderNotePath(path))?.id,
        }
        folderNodes.set(path, created)
        const parent = dirname(path)
        if (parent) {
          links.push({ source: created.id, target: ensureFolder(parent).id, structural: true })
        }
        return created
      }
      for (const note of notes) {
        const dir = dirname(note.path)
        if (!dir) continue
        links.push({ source: note.id, target: ensureFolder(dir).id, structural: true })
      }
      const folderDegree = new Map<string, number>()
      for (const link of links) {
        if (!link.structural) continue
        const from = link.source as string
        const to = link.target as string
        folderDegree.set(from, (folderDegree.get(from) ?? 0) + 1)
        folderDegree.set(to, (folderDegree.get(to) ?? 0) + 1)
      }
      for (const node of folderNodes.values()) {
        node.degree = folderDegree.get(node.id) ?? 0
        nodes.push(node)
      }

      // Carry positions over from the previous layout so a refresh — a save
      // that changed one link — nudges the graph rather than reshuffling it.
      const previous = new Map(nodesRef.current.map((n) => [n.id, n]))
      let carried = 0
      for (const node of nodes) {
        const old = previous.get(node.id)
        if (!old || old.x == null) continue
        node.x = old.x
        node.y = old.y
        node.vx = old.vx
        node.vy = old.vy
        carried++
      }

      allNodesRef.current = nodes
      allLinksRef.current = links
      // A first layout needs the full run; a refresh of a graph already on
      // screen only needs to settle the part that moved.
      applyLayout(carried > 0 ? 0.25 : 1)
    })

    function toWorld(sx: number, sy: number) {
      const t = transformRef.current
      return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k }
    }

    function clearHover() {
      if (hoverTimerRef.current != null) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null
        hoverNeighborsRef.current = new Set()
        setTooltip(null)
        draw()
      }
    }

    // A node opens or moves depending on how the pointer that landed on it
    // released — shared by the mouse click path and the touch tap path below.
    function openNode(node: GraphNode, at: { clientX: number; clientY: number }) {
      // A folder pseudo-node names a place, not a note — unless it has its
      // own note (see paths.ts's folderNotePath), in which case opening it
      // behaves exactly like opening that note. Opening a placeholder writes
      // the note it stands for, which is what following the wikilink itself
      // would have done.
      if (node.folder) {
        if (node.noteId) void open(node.noteId)
      } else if (node.ambiguous) {
        const matches = matchNotesByTarget(notes, node.title)
        useUiStore.getState().setLinkChoice({
          x: at.clientX,
          y: at.clientY,
          target: node.title,
          matches,
        })
      } else if (node.unresolved) {
        void openOrCreate(node.title)
      } else {
        void open(node.id)
      }
    }

    // The distance and midpoint between the first two active touches, for
    // pinch-to-zoom — null once fewer than two fingers are down.
    function pinchAnchor(): { distance: number; midX: number; midY: number } | null {
      if (activeTouchesRef.current.size < 2) return null
      const pts = [...activeTouchesRef.current.values()].slice(0, 2)
      return {
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
      }
    }

    function handlePointerDown(e: PointerEvent) {
      canvas!.setPointerCapture(e.pointerId)
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (e.pointerType === 'touch') {
        // Without this, a still finger is also a long-press to the browser's
        // own gesture recognizer — which fires its context-menu/selection
        // haptic regardless of what's underneath, node or empty canvas,
        // entirely independently of the hold-to-drag timer below. Telling it
        // up front that this touch is ours is what stops that buzz on empty
        // canvas; the deliberate vibrate a real drag start gives (below) is
        // the only haptic feedback left once this is in place.
        e.preventDefault()
        activeTouchesRef.current.set(e.pointerId, { x: sx, y: sy })
        const anchor = pinchAnchor()
        if (anchor) {
          // A second finger landing means this is a pinch, not a tap, a
          // hold-to-drag, or a one-finger pan — abandon whatever single-touch
          // gesture was already in flight and start the pinch from here.
          if (longPressTimerRef.current != null) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
          if (dragRef.current) {
            dragRef.current.node.fx = null
            dragRef.current.node.fy = null
            simRef.current?.alphaTarget(0)
            dragRef.current = null
          }
          pendingTouchRef.current = null
          panRef.current = null
          clearHover()
          pinchRef.current = anchor
          return
        }
      }

      const node = nodeAt(sx, sy)
      if (node && e.pointerType === 'touch') {
        // Touch is fiddlier than a mouse click: a finger's contact point
        // drifts a few pixels even on a still tap, so grabbing the node the
        // instant it's touched (the mouse behavior below) turned almost
        // every attempt to open a note into an accidental drag instead. A
        // touch that lands on a node now waits: it resolves to a tap (open),
        // a pan (moved before the hold fired), or a drag (held still long
        // enough) in handlePointerMove/Up.
        pendingTouchRef.current = { node, startX: sx, startY: sy }
        longPressTimerRef.current = setTimeout(() => {
          const pending = pendingTouchRef.current
          pendingTouchRef.current = null
          longPressTimerRef.current = null
          if (!pending) return
          pending.node.fx = pending.node.x
          pending.node.fy = pending.node.y
          dragRef.current = { node: pending.node, moved: false }
          simRef.current?.alphaTarget(0.3).restart()
          // A node is the only thing that ever gets this far, so this is the
          // one moment worth a tick — confirmation that the hold picked
          // something up, not a generic "you held still" buzz.
          navigator.vibrate?.(10)
        }, TOUCH_LONG_PRESS_MS)
      } else if (node) {
        node.fx = node.x
        node.fy = node.y
        dragRef.current = { node, moved: false }
        simRef.current?.alphaTarget(0.3).restart()
      } else {
        const t = transformRef.current
        panRef.current = { x: sx, y: sy, tx: t.x, ty: t.y }
      }
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (e.pointerType === 'touch' && activeTouchesRef.current.has(e.pointerId)) {
        activeTouchesRef.current.set(e.pointerId, { x: sx, y: sy })
      }

      if (pinchRef.current) {
        const anchor = pinchAnchor()
        if (!anchor) return // a finger left mid-pinch; handlePointerUp resolves it
        const prev = pinchRef.current
        const t = transformRef.current
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * (anchor.distance / prev.distance)))
        // Anchor on the midpoint's *previous* world position so the same
        // spot on the graph stays under the fingers as they spread, move, or
        // both at once — the same trick handleWheel uses for the cursor.
        const world = toWorld(prev.midX, prev.midY)
        transformRef.current = { k, x: anchor.midX - world.x * k, y: anchor.midY - world.y * k }
        pinchRef.current = anchor
        draw()
        return
      }

      if (dragRef.current) {
        clearHover()
        const world = toWorld(sx, sy)
        dragRef.current.node.fx = world.x
        dragRef.current.node.fy = world.y
        dragRef.current.moved = true
        draw()
      } else if (panRef.current) {
        clearHover()
        const p = panRef.current
        transformRef.current = { ...transformRef.current, x: p.tx + (sx - p.x), y: p.ty + (sy - p.y) }
        draw()
      } else if (pendingTouchRef.current) {
        const pending = pendingTouchRef.current
        const dist = Math.hypot(sx - pending.startX, sy - pending.startY)
        if (dist > TOUCH_MOVE_CANCEL_PX) {
          // Slid before the hold fired — read that as an attempt to pan the
          // canvas, not a hold-to-drag, so a finger that isn't perfectly
          // still while tapping doesn't yank the node out from under it.
          if (longPressTimerRef.current != null) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
          pendingTouchRef.current = null
          const t = transformRef.current
          panRef.current = { x: sx, y: sy, tx: t.x, ty: t.y }
        }
      } else {
        const node = nodeAt(sx, sy)
        if (node?.id !== hoveredIdRef.current) {
          clearHover()
          hoveredIdRef.current = node?.id ?? null
          if (node) {
            const neighbors = new Set<string>()
            for (const link of linksRef.current) {
              const s = link.source as GraphNode
              const t = link.target as GraphNode
              if (s.id === node.id) neighbors.add(t.id)
              else if (t.id === node.id) neighbors.add(s.id)
            }
            hoverNeighborsRef.current = neighbors
            draw()
          }
          // A folder or a real note both have a path worth showing; an
          // unresolved/ambiguous placeholder doesn't exist yet and has none.
          if (node?.path != null) {
            const path = node.path
            const { width, height } = sizeRef.current
            const OFFSET = 12
            // Room enough for a wrapped path even in the narrowest panel —
            // clamping left/top to leave at least this much keeps the box
            // inside .graph-view instead of drifting past its clipped edge.
            const MIN_ROOM = 150
            const left = Math.min(sx + OFFSET, Math.max(0, width - MIN_ROOM))
            const top = Math.min(sy + OFFSET, Math.max(0, height - 60))
            const maxWidth = Math.max(MIN_ROOM, width - left - OFFSET)
            hoverTimerRef.current = setTimeout(() => {
              setTooltip({ text: path, left, top, maxWidth })
            }, HOVER_DELAY)
          }
        }
      }
    }

    function handlePointerUp(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        activeTouchesRef.current.delete(e.pointerId)
        if (pinchRef.current) {
          // Still two or more fingers down: reseed the anchor from whichever
          // remain instead of ending the gesture. Down to one or none: the
          // pinch is over — don't resume a single-touch tap/drag/pan for a
          // finger that's still down, since lifting out of a pinch shouldn't
          // suddenly start moving a node.
          pinchRef.current = pinchAnchor()
          return
        }
      }

      // A touch released before the hold fired, and never slid far enough to
      // become a pan either — that's a tap, so open the note it landed on.
      if (pendingTouchRef.current) {
        if (longPressTimerRef.current != null) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        const node = pendingTouchRef.current.node
        pendingTouchRef.current = null
        openNode(node, e)
        return
      }

      const drag = dragRef.current
      if (drag) {
        drag.node.fx = null
        drag.node.fy = null
        simRef.current?.alphaTarget(0)
        if (!drag.moved) openNode(drag.node, e)
        dragRef.current = null
      }
      panRef.current = null
    }

    // A touch's contact can be cancelled by the OS mid-gesture (e.g. a
    // system edge-swipe stealing it) without ever firing pointerup — leaving
    // the pending/dragged state behind would pin a node in place forever, or
    // leave a stale hold timer waiting to fire on a finger that's long gone.
    function handlePointerCancel(e: PointerEvent) {
      if (e.pointerType === 'touch') activeTouchesRef.current.delete(e.pointerId)
      pinchRef.current = pinchAnchor()
      if (longPressTimerRef.current != null) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      pendingTouchRef.current = null
      if (dragRef.current) {
        dragRef.current.node.fx = null
        dragRef.current.node.fy = null
        simRef.current?.alphaTarget(0)
        dragRef.current = null
      }
      panRef.current = null
    }

    // Focus mode's own entry/exit gesture — deliberately separate from the
    // plain click above (which already opens a note): a double-click on any
    // node, note or not, commits to viewing just its branches, and one on
    // empty canvas backs back out to the whole graph. An unresolved/ambiguous
    // placeholder has no note to open; a folder does only if it has its own
    // (see paths.ts's folderNotePath).
    function handleDoubleClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const node = nodeAt(sx, sy)
      if (node) {
        if (!node.unresolved) {
          if (node.folder) {
            if (node.noteId) void open(node.noteId)
          } else {
            void open(node.id)
          }
        }
        useUiStore.getState().focusGraph(node.id)
      } else {
        setGraphFocus(false)
      }
    }

    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const t = transformRef.current
      const factor = Math.exp(-e.deltaY * 0.001)
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor))
      const world = toWorld(sx, sy)
      transformRef.current = { k, x: sx - world.x * k, y: sy - world.y * k }
      draw()
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)
    canvas.addEventListener('pointerleave', clearHover)
    canvas.addEventListener('dblclick', handleDoubleClick)
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      simRef.current?.stop()
      clearHover()
      if (longPressTimerRef.current != null) clearTimeout(longPressTimerRef.current)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      canvas.removeEventListener('pointerleave', clearHover)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      canvas.removeEventListener('wheel', handleWheel)
    }
    // Re-run when the set of notes changes, and when anything may have
    // rewritten the link table — adding a [[link]] to an existing note leaves
    // every note id untouched, so noteIds alone would never notice. The
    // active note is picked up live via the refs above instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIds, linksVersion])

  // A focus change (entering/leaving focus mode, or the open note changing
  // while it's on) only needs the already-fetched graph re-filtered and the
  // simulation restarted — not a refetch, which is a real network round trip
  // and would make selecting notes feel laggy.
  useEffect(() => {
    applyLayoutRef.current?.()
  }, [focusRoot])

  return (
    <div ref={containerRef} className="graph-view">
      <canvas ref={canvasRef} className="graph-view__canvas" />
      <div className="graph-view__toolbar">
        <button
          type="button"
          className={`icon-button${graphFocus ? ' icon-button--active' : ''}`}
          title={graphFocus ? 'Show full graph' : 'Focus on the open note'}
          aria-label={graphFocus ? 'Show full graph' : 'Focus on the open note'}
          aria-pressed={graphFocus}
          disabled={!graphFocus && !graphFocusId && !activeId}
          onClick={() => setGraphFocus(!graphFocus)}
        >
          <Icon name="focus" />
        </button>
      </div>
      {tooltip && (
        <div
          className="graph-view__tooltip"
          style={{ left: tooltip.left, top: tooltip.top, maxWidth: tooltip.maxWidth }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
