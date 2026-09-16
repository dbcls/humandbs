import type { Messages } from "./messages"

/**
 * What a window is called.
 *
 * **The parts run from this screen outwards**: the name the screen gives
 * itself, then which one it is about, then the site. That is the order the
 * screen itself reads in — a heading names the role and the identifier stands
 * beside it (`components/base.tsx` の `Heading`) — so a reader with several
 * windows open tells them apart by the same word in both places.
 *
 * **The subject is which one, not how many.** A listing puts the number of rows
 * beside its name, and a count in a window's name says nothing about which
 * window it is.
 *
 * **A subject that is not there falls out** rather than being stood in for. A
 * research with no number yet is titled by its role alone; filling the gap with
 * the role a second time gives the window the same word twice.
 */
export function pageTitle(
  messages: Messages,
  name: string,
  subject?: string | null,
): string {
  return [name, subject ?? "", messages.siteName].filter((one) => one !== "").join(" - ")
}
