import { useEffect, useRef } from 'react'
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
import { listResolvedLinks } from '../lib/notes'
import type { NoteMeta } from '../lib/notes'

type GraphNode = SimulationNodeDatum & { id: string; title: string; degree: number }
type GraphLink = SimulationLinkDatum<GraphNode>

const FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MIN_ZOOM = 0.25
const MAX_ZOOM = 3

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

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const dragRef = useRef<{ node: GraphNode; moved: boolean } | null>(null)
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)

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
      return (4 + Math.min(node.degree, 8)) * Math.min(transformRef.current.k, 1.4)
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

      ctx!.strokeStyle = lineColor
      ctx!.lineWidth = 1
      for (const link of linksRef.current) {
        const s = link.source as GraphNode
        const t = link.target as GraphNode
        if (s.x == null || t.x == null || s.y == null || t.y == null) continue
        const p1 = project(s.x, s.y)
        const p2 = project(t.x, t.y)
        ctx!.beginPath()
        ctx!.moveTo(p1.x, p1.y)
        ctx!.lineTo(p2.x, p2.y)
        ctx!.stroke()
      }

      ctx!.font = FONT
      ctx!.textBaseline = 'middle'
      // Rounded to a step so a drag-resize reuses cache entries instead of
      // measuring every title afresh at every intermediate pixel width.
      const maxLabel = Math.max(60, Math.round((width * 0.4) / 20) * 20)
      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue
        const p = project(node.x, node.y)
        const r = radiusOf(node)
        const isActive = node.id === activeIdRef.current

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx!.fillStyle = isActive ? accent : nodeColor
        ctx!.fill()

        ctx!.fillStyle = isActive ? accent : labelColor
        ctx!.fillText(fitLabel(ctx!, node.title, maxLabel, labelCache), p.x + r + 4, p.y)
      }
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

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    listResolvedLinks().then((edges) => {
      if (cancelled) return

      const degree = new Map<string, number>()
      for (const e of edges) {
        degree.set(e.source_note_id, (degree.get(e.source_note_id) ?? 0) + 1)
        degree.set(e.target_note_id, (degree.get(e.target_note_id) ?? 0) + 1)
      }

      const nodes: GraphNode[] = notes.map((n) => ({
        id: n.id,
        title: n.title,
        degree: degree.get(n.id) ?? 0,
      }))
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const links: GraphLink[] = edges
        .filter((e) => byId.has(e.source_note_id) && byId.has(e.target_note_id))
        .map((e) => ({ source: e.source_note_id, target: e.target_note_id }))

      nodesRef.current = nodes
      linksRef.current = links

      const { width, height } = sizeRef.current
      simRef.current?.stop()
      simRef.current = forceSimulation(nodes)
        .force('charge', forceManyBody().strength(-140))
        .force(
          'link',
          forceLink<GraphNode, GraphLink>(links)
            .id((d) => d.id)
            .distance(56),
        )
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide<GraphNode>((d) => radiusOf(d) + 6))
        .on('tick', draw)

      resize()
    })

    function toWorld(sx: number, sy: number) {
      const t = transformRef.current
      return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k }
    }

    function handlePointerDown(e: PointerEvent) {
      canvas!.setPointerCapture(e.pointerId)
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const node = nodeAt(sx, sy)
      if (node) {
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

      if (dragRef.current) {
        const world = toWorld(sx, sy)
        dragRef.current.node.fx = world.x
        dragRef.current.node.fy = world.y
        dragRef.current.moved = true
        draw()
      } else if (panRef.current) {
        const p = panRef.current
        transformRef.current = { ...transformRef.current, x: p.tx + (sx - p.x), y: p.ty + (sy - p.y) }
        draw()
      }
    }

    function handlePointerUp() {
      const drag = dragRef.current
      if (drag) {
        drag.node.fx = null
        drag.node.fy = null
        simRef.current?.alphaTarget(0)
        if (!drag.moved) void open(drag.node.id)
        dragRef.current = null
      }
      panRef.current = null
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
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      simRef.current?.stop()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('wheel', handleWheel)
    }
    // Re-run only when the vault's set of notes changes; content edits and
    // active-note changes are picked up live via the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIds])

  return (
    <div ref={containerRef} className="graph-view">
      <canvas ref={canvasRef} className="graph-view__canvas" />
    </div>
  )
}
