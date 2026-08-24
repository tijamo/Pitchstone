import { useRef, useState } from 'react'
import {
  useUiStore,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  maxRightWidth,
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
  // The right panel's own cap floats with the window and the left sidebar's
  // width — see maxRightWidth. Only its aria value needs it; the store's own
  // setRightWidth re-derives and enforces the real max on every drag.
  const leftReserved = useUiStore((s) => (s.leftOpen ? s.leftWidth : 0))
  const max = side === 'left' ? MAX_PANEL_WIDTH : maxRightWidth(leftReserved)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // The left panel grows as the pointer moves right; the right panel is
  // mirrored, so every delta below is signed by which side it belongs to.
  const grows = side === 'left' ? 1 : -1

  // Double-clicking a divider to put it back to its default is a convention
  // worth honouring — it is the quick way out of an awkward drag.
  const reset = () => setWidth(side === 'left' ? DEFAULT_LEFT_WIDTH : DEFAULT_RIGHT_WIDTH)

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
