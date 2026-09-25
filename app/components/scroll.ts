/**
 * Bringing a thing into view inside the pane that scrolls it, and nothing else.
 *
 * `scrollIntoView` moves every scrolling ancestor at once — the pane, the page
 * behind it, and sideways as well — so a jump from the page pane pulled the header
 * of the screen back into the window (which unsticks the toolbar) and could
 * drag a two-column block off its left edge. The pane is the only thing meant to
 * move, and only up and down: where the window remains is the reader's, and
 * nothing a pane holds is meant to be wider than it.
 */

/** An element as it is laid out on screen: its top edge and its height. */
export interface Rect {
  top: number
  height: number
}

/**
 * Where a pane's `scrollTop` has to be for `target` to sit at `block`.
 *
 * Both rects are read as they are laid out on screen, so the target's place in the
 * pane's own scroll coordinates is its distance from the pane's top plus what
 * the pane has already scrolled. A negative answer is clamped: the pane cannot
 * scroll above its own start, and requesting it to leaves the target below where it
 * was promised.
 */
export function paneScrollTop(pane: Rect & { scrollTop: number }, target: Rect, block: "start" | "center"): number {
  const offset = target.top - pane.top + pane.scrollTop
  const top = block === "start" ? offset : offset - (pane.height - target.height) / 2
  return Math.max(0, top)
}

/** The pane's scrolling box, as `usePanes` marks it (`admin.tsx`). */
const PANE_BODY = "[data-pane-body]"

/**
 * Scrolls the pane holding `target` so that `target` sits at `block`. Outside a
 * pane the browser's own scroll is used, which is then the only one there is.
 */
export function scrollPaneTo(target: HTMLElement, block: "start" | "center"): void {
  const pane = target.closest<HTMLElement>(PANE_BODY)
  if (pane === null) {
    target.scrollIntoView(block === "start" ? undefined : { block })
    return
  }
  const paneRect = pane.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  pane.scrollTo({
    top: paneScrollTop(
      { top: paneRect.top, height: pane.clientHeight, scrollTop: pane.scrollTop },
      { top: rect.top, height: rect.height },
      block,
    ),
  })
}
