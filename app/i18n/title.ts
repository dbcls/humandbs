import { adminArea } from "~/admin/navigation"

import type { Messages } from "./messages"

const SEPARATOR = " | "

/**
 * What a window is called.
 *
 * **The steps run from this screen outwards** — the breadcrumb read backwards,
 * ending at the site: `hum0006-v2 | hum0006 | 研究一覧 | NBDC ヒトデータベース`.
 * A tab shows only its first few words, so the narrowest name goes first, and
 * two pages of the same research open side by side differ in the words that
 * are still visible. The breadcrumb's first step, the front page, is left out:
 * the site name at the end already says it.
 *
 * **A step that is not there falls out** rather than being stood in for, and a
 * step that repeats the one before it is said once — the listing an area opens
 * on is both the screen and the area.
 *
 * **The subject is which one, not how many.** A listing puts the number of rows
 * beside its name, and a count in a window's name says nothing about which
 * window it is.
 */
export function windowTitle(
  messages: Messages,
  steps: readonly (string | null | undefined)[],
): string {
  const kept: string[] = []
  for (const step of [...steps, messages.siteName]) {
    const word = step?.trim() ?? ""
    if (word !== "" && word !== kept[kept.length - 1]) kept.push(word)
  }
  return kept.join(SEPARATOR)
}

/**
 * A management screen's window: its name, which one it is about, the area of
 * the bar it sits in, and the management area itself.
 *
 * The management area has no breadcrumb, so the bar's area stands in for the
 * steps above the screen. **The steps between are left out** — a dataset
 * under a draft under a research would otherwise run to seven steps, which no
 * tab shows.
 */
export function adminWindowTitle(
  messages: Messages,
  path: string,
  name: string,
  subject?: string | null,
): string {
  return windowTitle(messages, [name, subject, adminArea(messages.admin, path), messages.admin.heading])
}
