/**
 * Where the management area can be gone from any of its screens.
 *
 * **One list, and the only one.** A screen does not carry links to its
 * neighbours: the shell draws these on every screen under `/admin`
 * (`components/layout.tsx`), so adding an area means adding a line here rather
 * than editing the screens that would have to point at it.
 *
 * **It is not filtered by capability.** Only an administrator sees it at all,
 * and an administrator holds every capability; deriving the list from what the
 * reader may do would mean sending an authorisation decision to the browser,
 * which the root loader deliberately does not do (`root.tsx`). The screens
 * themselves each ask for the capability they need.
 *
 * The order is the order the work runs in — what is being edited, then what
 * editing draws on, then the site around it, then the tools beside it.
 */

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import {
  adminAssistantPath,
  adminCatalogPath,
  adminContentsPath,
  adminPath,
  adminResearchListPath,
} from "./urls"

export interface AdminDestination {
  path: string
  label: string
}

export function adminNavigation(locale: Locale): AdminDestination[] {
  const words = messagesFor(locale).admin
  return [
    { path: adminPath(), label: words.overview },
    { path: adminResearchListPath(), label: words.research.heading },
    { path: adminCatalogPath(), label: words.catalog.heading },
    { path: adminContentsPath(), label: words.contents.heading },
    { path: adminAssistantPath(), label: words.assistant.heading },
  ]
}

/**
 * Whether an entry names where the reader already is.
 *
 * **The entry for the area's own front page matches only itself**, because
 * every other address starts with it; the rest match what lies under them, so
 * that a draft three levels down still lights the area it belongs to.
 */
export function isHere(entry: AdminDestination, path: string): boolean {
  if (entry.path === adminPath()) return path === adminPath()
  return path === entry.path || path.startsWith(`${entry.path}/`)
}
