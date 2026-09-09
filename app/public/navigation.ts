/**
 * The global navigation and the footer sitemap.
 *
 * These live in code rather than in the database because nothing edits them at
 * runtime: there is no admin screen for navigation, so a table would only be
 * writable by editing a migration. The labels settle the question — they are
 * hand-written short forms, not document titles (`機関外サーバ` against a
 * document titled `所属機関外利用可能サーバ（機関外サーバ）の導入について`),
 * which makes them interface text of the same kind as `i18n/messages.ts`.
 *
 * A destination is an internal path: either a slug that a document answers at,
 * or a path a route owns (`/`, `/data-use`, `/research`). The test that every
 * destination is answered by something is the only guard against a slug being
 * renamed out from under an entry — a foreign key would not have caught the
 * hand-written labels drifting anyway.
 */

import type { Locale } from "~/i18n/locale"

export interface NavLabel {
  ja: string
  en: string
}

export interface NavLink {
  path: string
  label: NavLabel
}

/**
 * A destination in the sitemap, with the documents that belong under it.
 *
 * **An entry with children becomes a column and an entry without becomes one
 * line in the row below them** (`components/layout.tsx`). The name of a column
 * is a label rather than a link, and the entry's own page is drawn as the first
 * link under it — which is where a reader looks for it and what v1 does.
 */
export interface NavEntry extends NavLink {
  children?: NavLink[]
}

export function navLabel(label: NavLabel, locale: Locale): string {
  return label[locale]
}

const GUIDELINES: NavLink = {
  path: "/guidelines",
  label: { ja: "ガイドライン", en: "Guidelines" },
}

const GUIDELINE_DOCUMENTS: NavLink[] = [
  {
    path: "/guidelines/data-sharing-guidelines",
    label: {
      ja: "NBDCヒトデータ共有ガイドライン",
      en: "NBDC Guidelines for Human Data Sharing",
    },
  },
  {
    path: "/guidelines/security-guidelines-for-users",
    label: {
      ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データ利用者向け）",
      en: "NBDC Security Guidelines for Human Data (for Data Users)",
    },
  },
  {
    path: "/guidelines/security-guidelines-for-submitters",
    label: {
      ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データ提供者向け）",
      en: "NBDC Security Guidelines for Human Data (for Data Submitters)",
    },
  },
  {
    path: "/guidelines/security-guidelines-for-dbcenters",
    label: {
      ja: "NBDCヒトデータ取扱いセキュリティガイドライン（データベースセンター運用責任者ならびに機関外サーバ運用責任者向け）",
      en: "NBDC Security Guidelines for Human Data (for Database Center and Off-premise Server Operation Managers)",
    },
  },
]

const DATA_SUBMISSION: NavLink = {
  path: "/data-submission",
  label: { ja: "データの提供", en: "Data Submission" },
}

const DATA_USE: NavLink = {
  path: "/data-use",
  label: { ja: "データの利用", en: "Data Use" },
}

const RESEARCH_LIST: NavLink = {
  path: "/research",
  label: { ja: "研究一覧", en: "Research List" },
}

const DATASET_LIST: NavLink = {
  path: "/dataset",
  label: { ja: "データセット一覧", en: "Dataset List" },
}

const DATA_PROCESSING: NavLink = {
  path: "/data-processing",
  label: { ja: "加工データ", en: "Data Processing" },
}

const OFF_PREMISE_SERVER: NavLink = {
  path: "/off-premise-server",
  label: { ja: "機関外サーバ", en: "Off-premise Server" },
}

const DAC: NavLink = {
  path: "/dac",
  label: { ja: "ヒトデータ審査委員会", en: "Data Access Committee" },
}

const PUBLICATIONS: NavLink = {
  path: "/publications",
  label: { ja: "成果発表", en: "Publications" },
}

const VIOLATION: NavLink = {
  path: "/violation",
  label: { ja: "ガイドライン違反", en: "Guideline Violation" },
}

const FAQ: NavLink = {
  path: "/faq",
  label: { ja: "FAQ", en: "FAQ" },
}

const PRIVACY_POLICY: NavLink = {
  path: "/privacy-policy",
  label: { ja: "プライバシーポリシー", en: "Privacy Policy" },
}

const CONTACT_US: NavLink = {
  path: "/contact-us",
  label: { ja: "お問い合わせ", en: "Contact us" },
}

/**
 * The bar across the top, in the order it shows them.
 *
 * **Every entry is a link and none of them opens.** A drop-down in the bar is a
 * second way to reach two listings that are in the bar themselves, and a menu
 * that opens on hover is the one control a reader cannot use by looking at it.
 *
 * **The order is also the order they are given up in**, since the bar keeps as
 * many as fit from the front. It is v1's, with the two listings placed where v1
 * folds them — under "data use" — rather than ahead of it.
 */
export const NAVBAR: NavLink[] = [
  GUIDELINES,
  DATA_SUBMISSION,
  DATA_USE,
  RESEARCH_LIST,
  DATASET_LIST,
  DATA_PROCESSING,
  OFF_PREMISE_SERVER,
  DAC,
  PUBLICATIONS,
  FAQ,
  CONTACT_US,
  VIOLATION,
  PRIVACY_POLICY,
]

/**
 * **How wide the window has to be before each entry appears in the bar.**
 *
 * The bar is one row and the row runs out; what does not fit goes behind the
 * menu at its end rather than wrapping to a second line. The steps are written
 * out as whole class names because Tailwind cannot see a class that is
 * assembled at runtime, and the two columns are complements — an entry is in
 * the bar exactly when it is not in the menu, so neither list can go missing.
 *
 * **Nothing is behind the menu at every width.** A destination that is in the
 * menu on a wide screen is one the reader is told to look for while the room
 * to show it sits empty beside the button.
 *
 * **The counts come from measuring the labels**, in both languages, against the
 * room left over once the wordmark, the menu and the controls have taken
 * theirs. Some of the steps are widths Tailwind has no name for, which is what
 * the labels happen to need — the alternative is a bar that leaves a hundred
 * pixels of room unused so that the numbers can be round.
 */
export const NAVBAR_STEP: { bar: string, menu: string }[] = [
  { bar: "hidden sm:block", menu: "sm:hidden" },
  { bar: "hidden md:block", menu: "md:hidden" },
  { bar: "hidden lg:block", menu: "lg:hidden" },
  { bar: "hidden lg:block", menu: "lg:hidden" },
  { bar: "hidden xl:block", menu: "xl:hidden" },
  { bar: "hidden xl:block", menu: "xl:hidden" },
  { bar: "hidden xl:block", menu: "xl:hidden" },
  { bar: "hidden 2xl:block", menu: "2xl:hidden" },
  { bar: "hidden 2xl:block", menu: "2xl:hidden" },
  { bar: "hidden min-[1584px]:block", menu: "min-[1584px]:hidden" },
  { bar: "hidden min-[1680px]:block", menu: "min-[1680px]:hidden" },
  { bar: "hidden min-[1840px]:block", menu: "min-[1840px]:hidden" },
  { bar: "hidden min-[1840px]:block", menu: "min-[1840px]:hidden" },
]

/**
 * **The menu itself goes when the bar holds everything.** A button that opens
 * on nothing tells the reader to look somewhere for a destination that is
 * already in front of them, next to the room it would have taken.
 */
export const NAVBAR_MENU_STEP = NAVBAR_STEP[NAVBAR_STEP.length - 1]?.menu ?? ""

/**
 * The sitemap at the foot of every page. It repeats the bar and adds what the
 * bar has no room for — the four guidelines by name, and the privacy policy.
 */
export const FOOTER: NavEntry[] = [
  { ...GUIDELINES, children: GUIDELINE_DOCUMENTS },
  DATA_SUBMISSION,
  { ...DATA_USE, children: [RESEARCH_LIST, DATASET_LIST] },
  OFF_PREMISE_SERVER,
  DAC,
  DATA_PROCESSING,
  FAQ,
  PRIVACY_POLICY,
  PUBLICATIONS,
  VIOLATION,
  CONTACT_US,
]

/** Every distinct destination the lists point at, for the reachability test. */
export function navigationPaths(): string[] {
  const entries: NavEntry[] = [...NAVBAR, ...FOOTER]
  const paths = entries.flatMap(
    (entry) => [entry.path, ...(entry.children ?? []).map((child) => child.path)],
  )
  return [...new Set(paths)].sort()
}
