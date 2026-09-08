/**
 * Where the management area can be gone from any of its screens.
 *
 * **One list, and the only one.** A screen does not carry links to its
 * neighbours: the tab at the edge of the window draws the top of this on every
 * screen under `/admin` (`components/admin.tsx`) and the area's front page
 * draws all of it (`routes/admin.tsx`), so adding an area means adding a line
 * here rather than editing the screens that would have to point at it.
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
  adminContentFilesPath,
  adminContentsPath,
  adminExperimentFieldsPath,
  adminNewsListPath,
  adminPath,
  adminResearchListPath,
  adminUpstreamResearchPath,
} from "./urls"

export interface AdminDestination {
  path: string
  label: string
  /** Addresses that hang off it and are reachable without knowing an identity. */
  under?: AdminDestination[]
}

/**
 * The destinations, as a tree.
 *
 * **The tab shows the top of it; the front page shows all of it, flat.** Twelve
 * of the nineteen screens are about one research, one draft, one document, one
 * field — they are reached by choosing that thing rather than by an address
 * anybody can type, so what a map can offer is the seven that stand on their
 * own.
 *
 * **The tree is here for the tab, not for the map.** Every entry below is
 * reachable without knowing an identity, so drawing the map indented would
 * claim that a parent has to be opened first; the tab needs the shape because a
 * 36px handle can only hold the areas.
 *
 * **Nothing is said under a name.** A line of prose beneath each entry says
 * what the name should have said — a screen whose name needs a sentence has the
 * wrong name.
 */
export function adminDestinations(locale: Locale): AdminDestination[] {
  const words = messagesFor(locale).admin
  return [
    { path: adminPath(), label: words.overview },
    {
      path: adminResearchListPath(),
      label: words.research.heading,
      under: [
        { path: adminUpstreamResearchPath(), label: words.templates.heading },
      ],
    },
    { path: adminExperimentFieldsPath(), label: words.catalog.heading },
    {
      path: adminContentsPath(),
      label: words.contents.heading,
      under: [
        { path: adminNewsListPath(), label: words.contents.news.heading },
        { path: adminContentFilesPath(), label: words.contents.files.heading },
      ],
    },
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
export function isHere(entry: { path: string }, path: string): boolean {
  if (entry.path === adminPath()) return path === adminPath()
  return path === entry.path || path.startsWith(`${entry.path}/`)
}
