/**
 * Bringing a thing into view inside the pane that scrolls it, and nothing else.
 *
 * `scrollIntoView` moves every scrolling ancestor at once — the pane, the page
 * behind it, and sideways as well — so a jump from the page pane pulled the header
 * of the screen back into the window (which unsticks the toolbar) and could
 * drag a two-column block off its left edge. The pane is the only thing meant to
 * move up and down: where the window is scrolled to is the reader's. **A table
 * is the one thing a pane holds that may be wider than it** (`page.tsx` の
 * `Table`), and it moves sideways inside its own scroller, which moves nothing
 * around it.
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

/**
 * Where a table's sideways scroller has to have its `scrollLeft` for `target`
 * to sit in the middle of what shows of the table.
 *
 * **What shows starts after the columns that stay put** (`covered`, measured
 * from the scroller's left edge): a cell brought to the scroller's own middle
 * can still end up under them. The answer is clamped to the two ends the
 * scroller can reach.
 */
export function tableScrollLeft(
  table: { left: number, width: number, scrollLeft: number, scrollWidth: number, covered: number },
  target: { left: number, width: number },
): number {
  const offset = target.left - table.left + table.scrollLeft
  const left = offset - table.covered - (table.width - table.covered - target.width) / 2
  return Math.min(Math.max(0, left), Math.max(0, table.scrollWidth - table.width))
}

/** The scroller a table wider than its place travels sideways in (`page.tsx` の `Table`). */
const TABLE_SCROLLER = "[data-table-scroller]"

/**
 * Scrolls the table holding `target` sideways so that `target` sits in the
 * middle of what shows of it. Outside a table that travels, nothing moves.
 */
export function scrollTableTo(target: HTMLElement): void {
  const scroller = target.closest<HTMLElement>(TABLE_SCROLLER)
  if (scroller === null || scroller.scrollWidth <= scroller.clientWidth) return
  const table = scroller.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  // The leading columns stay put over the ones travelling under them, so
  // what shows starts at the right edge of the last of them in this row.
  const stuck = [...(target.closest("tr")?.children ?? [])]
    .filter((cell) => getComputedStyle(cell).position === "sticky")
    .map((cell) => cell.getBoundingClientRect().right - table.left)
  scroller.scrollTo({
    left: tableScrollLeft(
      {
        left: table.left,
        width: scroller.clientWidth,
        scrollLeft: scroller.scrollLeft,
        scrollWidth: scroller.scrollWidth,
        covered: Math.max(0, ...stuck),
      },
      { left: rect.left, width: rect.width },
    ),
  })
}
