import type { ReactNode } from "react"

import { BigAction } from "~/components/base"
import type { IconName } from "~/components/icons"

/**
 * The pieces the screens are built from — the ones that are layout rather than
 * text. These used to be written inside the CMS, as a markdown directive for
 * the button and inline flex styles for the row that holds them, which is what
 * put an extension to markdown and a raw-HTML route into every document. They
 * are components now, so the markdown dialect does not have to carry them.
 */
export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-center gap-6">{children}</div>
}

/**
 * A way in, at the size the front page gives one.
 *
 * **The tone says which half of the site it belongs to** — providing data is
 * accent, using it is brand — and it is the same on the front page and on the
 * screen it leads to, so the two never disagree about what colour "データの
 * 提供" is. Both leave for the application system, so both carry the arrow.
 */
export function ActionButton({ href, label, note, tone, icon, external = true }: {
  href: string
  label: string
  /** Who the way in is for. The front page has one button each and no note. */
  note?: string
  tone: "accent" | "brand"
  icon: IconName
  /** All but one of these leave for the application system. */
  external?: boolean
}) {
  return (
    <div className="flex w-80 max-w-full flex-col items-center gap-2">
      <div className="w-full">
        <BigAction to={href} tone={tone} icon={icon} external={external}>{label}</BigAction>
      </div>
      {note !== undefined && <span className="text-ink-muted text-sm">{note}</span>}
    </div>
  )
}

/** The sentences under the buttons, centred, each one already HTML. */
export function Notes({ children }: { children: ReactNode }) {
  return <div className="mt-12 flex flex-col items-center gap-3 text-center">{children}</div>
}
