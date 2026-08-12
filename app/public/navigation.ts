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
 * An entry with children opens; one without is a link itself. **An entry is
 * always a link**, so its children are what it adds rather than a list that
 * repeats it — a group heading and a first child pointing at the same page is
 * the same link twice.
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

/** The bar across the top. Only "データの利用" opens; the rest are links. */
export const NAVBAR: NavEntry[] = [
  GUIDELINES,
  DATA_SUBMISSION,
  { ...DATA_USE, children: [RESEARCH_LIST, DATASET_LIST] },
  DATA_PROCESSING,
  OFF_PREMISE_SERVER,
  DAC,
  FAQ,
  CONTACT_US,
]

/**
 * What the bar has no room for, behind the overflow control at its end.
 *
 * The bar is one row and the row has a width; whatever does not fit has to go
 * somewhere rather than be dropped, which is the arrangement v1 arrived at.
 * These are the least often wanted of the destinations, and all three are also
 * in the sitemap at the foot of the page.
 */
export const NAVBAR_MORE: NavLink[] = [PUBLICATIONS, VIOLATION, PRIVACY_POLICY]

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
  const entries: NavEntry[] = [...NAVBAR, ...NAVBAR_MORE, ...FOOTER]
  const paths = entries.flatMap(
    (entry) => [entry.path, ...(entry.children ?? []).map((child) => child.path)],
  )
  return [...new Set(paths)].sort()
}
