/**
 * A handle on the live editor for the few things outside it that need to drive
 * it — currently only the outline panel jumping to a heading.
 *
 * The editor registers a closure rather than handing over its `EditorView`, so
 * this module imports nothing from CodeMirror. That matters: the outline panel
 * imports it, and a type-only handle would otherwise drag the whole editor
 * bundle back into the main chunk it was just split out of.
 */
let reveal: ((line: number) => void) | null = null

export function setLineRevealer(fn: ((line: number) => void) | null): void {
  reveal = fn
}

export function revealLine(line: number): void {
  reveal?.(line)
}
