import { useRef, useState } from 'react'
import {
  useUiStore,
  DEFAULT_RIGHT_WIDTH,
  MIN_PANEL_WIDTH,
  defaultLeftWidth,
  maxPanelWidth,
} from '../store/uiStore'

/** How much one arrow-key press moves the edge. */
const KEY_STEP = 16

/**
 * The draggable edge of a sidebar. It sits inside the panel rather than in its
 * own grid column, so the shell's layout stays the four columns it always was
 * and a collapsed panel takes its handle with it.
 *
 * Pointer capture means a fast drag keeps steering the edge even once the
 * cursor has outrun it onto the editor or off the window entirely.
 */
export function Resizer({ side }: { side: 'left' | 'right' }) {
  const width = useUiStore((s) => (side === 'left' ? s.leftWidth : s.rightWidth))
  const setWidth = useUiStore((s) => (side === 'left' ? s.setLeftWidth : s.setRightWidth))
  // Either panel may be dragged out to whatever the window has left after the
  // ribbon and the other one — full width, if that is what is wanted. Only the
  // aria value needs this here; the store re-derives and enforces the real max
  // on every drag.
  const viewport = useUiStore((s) => s.viewport)
  const otherReserved = useUiStore((s) =>
    side === 'left' ? (s.rightOpen ? s.rightWidth : 0) : s.leftOpen ? s.leftWidth : 0,
  )
  const max = maxPanelWidth(otherReserved, viewport)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // The left panel grows as the pointer moves right; the right panel is
  // mirrored, so every delta below is signed by which side it belongs to.
  const grows = side === 'left' ? 1 : -1

  // Double-clicking a divider to put it back to its default is a convention
  // worth honouring — it is the quick way out of an awkward drag. The left
  // panel's default is the same three tenths of the window it opened at, so a
  // reset and a fresh session land in the same place.
  const reset = () =>
    setWidth(side === 'left' ? defaultLeftWidth(viewport) : DEFAULT_RIGHT_WIDTH)

  return (
    <div
      className={`resizer${dragging ? ' resizer--dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} sidebar`}
      aria-valuenow={width}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        // Without this the drag starts a text selection in the panel behind.
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { startX: e.clientX, startWidth: width }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        setWidth(drag.startWidth + (e.clientX - drag.startX) * grows)
      }}
      onPointerUp={(e) => {
        dragRef.current = null
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onDoubleClick={reset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        setWidth(width + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP) * grows)
      }}
    />
  )
}
