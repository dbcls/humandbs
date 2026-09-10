/**
 * Where the management area can be gone from any of its screens.
 *
 * **One file, two shapes.** A screen does not carry links to its neighbours:
 * the bar across the top of every screen under `/admin` draws them in one row
 * (`components/layout.tsx`), and the area's front page draws the same set
 * grouped by the work they are for (`routes/admin.tsx`). Adding a screen means
 * adding a line here rather than editing the screens that would have to point
 * at it.
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

import type { IconName } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import {
  adminAlertPath,
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
}

/** A destination on the front page, where each one is drawn as a box. */
export interface AdminEntry extends AdminDestination {
  icon: IconName
}

export interface AdminTask {
  title: string
  /** Said only where the title cannot say what the work is. */
  note?: string
  links: AdminEntry[]
  /** A form rather than a link: what it makes is what it opens. */
  action?: { to: string, label: string, icon: IconName }
}

/**
 * The row across the top of every management screen.
 *
 * **It holds the same screens the front page lists**, plus the front page
 * itself at its head — one set of names for the area, so that a screen is not
 * one thing in the bar and another on the map. A test holds the two to the same
 * set and the same sequence (`navigation.test.ts`).
 *
 * **The order is the front page's**, group after group. The two are the only
 * two faces the area has, and a reader who has learnt where a name sits on one
 * of them should not have to look for it somewhere else on the other. The bar
 * draws that sequence in one line; the front page has the room to draw it in
 * groups.
 *
 * **Which entries fall into the menu follows from that order** rather than
 * being chosen: the bar keeps as many as fit from the front, so what goes first
 * is what the work reaches last. The long names sit near the end of the work,
 * which is also where the room runs out.
 */
export function adminNavbar(locale: Locale): AdminDestination[] {
  const words = messagesFor(locale).admin
  return [
    { path: adminPath(), label: words.overview },
    { path: adminResearchListPath(), label: words.tasks.research.find },
    { path: adminUpstreamResearchPath(), label: words.tasks.research.fromUpstream },
    { path: adminContentsPath(), label: words.contents.heading },
    { path: adminAlertPath(), label: words.contents.alert.heading },
    { path: adminNewsListPath(), label: words.tasks.contents.news },
    { path: adminContentFilesPath(), label: words.contents.files.heading },
    { path: adminExperimentFieldsPath(), label: words.catalog.heading },
    { path: adminAssistantPath(), label: words.assistant.heading },
  ]
}

/**
 * **How wide the window has to be before each entry appears in the bar**, the
 * way the public bar carries its own (`public/navigation.ts`).
 *
 * The steps are written out as whole class names because Tailwind cannot see a
 * class assembled at runtime, and the two columns are complements — an entry is
 * in the bar exactly when it is not in the menu, so neither list can go
 * missing.
 *
 * **The numbers are measured, and they follow the order above.** Each is the
 * width at which the labels up to that point, the menu at the end of the row and
 * the wordmark and controls on either side of it still leave the row visibly
 * unfilled — a step set to the width where an entry merely fits puts it hard
 * against the control beside it. **English decides every step from the third
 * on**: the same nine screens run about a fifth wider there, so a ladder cut to
 * the Japanese labels overflows the English row.
 *
 * The first two are Tailwind's own `sm` and `md`. Below `sm` the bar carries
 * nothing and the menu carries everything, which is where a window that narrow
 * has to end up whatever the labels say.
 */
export const ADMIN_NAVBAR_STEP: { bar: string, menu: string }[] = [
  { bar: "hidden sm:block", menu: "sm:hidden" },
  { bar: "hidden md:block", menu: "md:hidden" },
  { bar: "hidden min-[928px]:block", menu: "min-[928px]:hidden" },
  { bar: "hidden min-[1008px]:block", menu: "min-[1008px]:hidden" },
  { bar: "hidden min-[1088px]:block", menu: "min-[1088px]:hidden" },
  { bar: "hidden min-[1216px]:block", menu: "min-[1216px]:hidden" },
  { bar: "hidden min-[1312px]:block", menu: "min-[1312px]:hidden" },
  { bar: "hidden min-[1488px]:block", menu: "min-[1488px]:hidden" },
  { bar: "hidden min-[1536px]:block", menu: "min-[1536px]:hidden" },
]

/**
 * **The menu itself goes when the bar holds everything.** A button that opens
 * on nothing tells the reader to look somewhere for a destination that is
 * already in front of them.
 */
export const ADMIN_NAVBAR_MENU_STEP
  = ADMIN_NAVBAR_STEP[ADMIN_NAVBAR_STEP.length - 1]?.menu ?? ""

/**
 * The work the area is for, and what each piece of it is pressed on.
 *
 * **A section is a verb, and the screens under it are where that work is
 * done.** A name on its own cannot say whether 「お知らせ」 is a screen to read
 * or one to write in, and lengthening the name does not settle it — the verb
 * above it does.
 *
 * **A note belongs to a section whose title cannot say what is inside it.**
 * Giving one to every section buries the titles under sentences nobody reads.
 *
 * **What is pressed is not always a destination.** Starting a research is an
 * action rather than an address, and a list that held only addresses would make
 * three ways to begin a research look like two.
 *
 * **The map says the short name and the screen says its role.** 「お知らせ」 is
 * enough under a section that already says which site the announcements are on,
 * while the screen it opens calls itself 「お知らせ一覧」 because a screen is
 * arrived at from anywhere and has to name itself out of any surroundings.
 * Holding the two to one word means every entry carries a qualification the map
 * has already given it.
 *
 * **A glyph rides in front of the word**, so that an entry is found by its shape
 * before it is read. **It says the subject, not the act** — a research is `book`
 * here and on the public side — and the one thing in the list that is not a
 * destination takes `plus`, which is the mark for adding everywhere else.
 */
export function adminTasks(locale: Locale): AdminTask[] {
  const words = messagesFor(locale).admin
  const tasks = words.tasks
  return [
    {
      title: tasks.research.title,
      links: [
        { path: adminResearchListPath(), label: tasks.research.find, icon: "book" },
        { path: adminUpstreamResearchPath(), label: tasks.research.fromUpstream, icon: "clipboard" },
      ],
      action: { to: adminResearchListPath(), label: tasks.research.create, icon: "plus" },
    },
    {
      title: tasks.contents.title,
      links: [
        { path: adminContentsPath(), label: words.contents.heading, icon: "newspaper" },
        { path: adminAlertPath(), label: words.contents.alert.heading, icon: "megaphone" },
        { path: adminNewsListPath(), label: tasks.contents.news, icon: "bell" },
        { path: adminContentFilesPath(), label: words.contents.files.heading, icon: "file" },
      ],
    },
    {
      title: tasks.fields.title,
      note: tasks.fields.note,
      links: [{ path: adminExperimentFieldsPath(), label: words.catalog.heading, icon: "filter" }],
    },
    {
      title: tasks.assistant.title,
      links: [{ path: adminAssistantPath(), label: words.assistant.heading, icon: "tip" }],
    },
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
