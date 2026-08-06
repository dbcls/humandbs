import type { ReactNode } from "react"

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

export function ActionButton({ href, label, note }: {
  href: string
  label: string
  /** Who the way in is for. The front page has one button each and no note. */
  note?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={href}
        className="flex min-h-24 w-80 max-w-full items-center justify-center rounded-xl bg-brand px-6 py-4 text-center font-bold text-white no-underline hover:bg-brand-light hover:text-white"
      >
        {label}
      </a>
      {note !== undefined && <span className="text-ink-muted text-sm">{note}</span>}
    </div>
  )
}

/** The sentences under the buttons, centred, each one already HTML. */
export function Notes({ children }: { children: ReactNode }) {
  return <div className="mt-12 flex flex-col items-center gap-3 text-center">{children}</div>
}
