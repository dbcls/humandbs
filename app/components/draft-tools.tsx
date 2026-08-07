/**
 * The two things every editing screen of a draft carries: who else has it open,
 * and what there is to go back to.
 *
 * Both are about the draft rather than about the screen, so a research and one
 * of its datasets show the same thing — the same people, the same stack. **A
 * dataset editor is an editor of the draft**, and somebody who has one open is
 * somebody to be careful of on the other.
 */

import { useEffect, useState } from "react"
import { useFetcher } from "react-router"

import type { PresenceView } from "~/admin/pages.server"
import { PRESENCE_HEARTBEAT_SECONDS } from "~/admin/presence"
import type { UndoEntryRow } from "~/admin/queries.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

/**
 * Saying we are here, over and over, and showing who else is.
 *
 * The heartbeat answers with the current list, so announcing and finding out
 * are one exchange. Nobody is made read-only by any of it: a save is checked
 * against a revision, and this is only so that two people editing the same
 * thing know about each other before that happens.
 */
export function PresenceLine({ locale, path, initial }: {
  locale: Locale
  path: string
  initial: PresenceView[]
}) {
  const t = messagesFor(locale).admin.draft
  const fetcher = useFetcher<{ present: PresenceView[] }>()
  const submit = fetcher.submit

  useEffect(() => {
    const beat = () => {
      void submit({}, { method: "post", action: path })
    }
    beat()
    const timer = setInterval(beat, PRESENCE_HEARTBEAT_SECONDS * 1000)
    return () => {
      clearInterval(timer)
    }
  }, [submit, path])

  const others = (fetcher.data?.present ?? initial).filter((row) => !row.isSelf)
  if (others.length === 0) return null

  return (
    <p className="text-ink-muted text-xs">
      {`${t.alsoEditing}: ${others.map((row) => row.name).join(", ")}`}
    </p>
  )
}

/**
 * The stack of what was on screen before, and of what a conflict refused.
 *
 * Picking one puts it back into the form and nowhere else. **Nothing here
 * writes**: an entry that a conflict refused would never pass the revision
 * check anyway, and one from before a save goes back the way any other edit
 * does — by being saved.
 */
export function UndoMenu({ locale, entries, onPick, loading }: {
  locale: Locale
  entries: UndoEntryRow[]
  onPick: (undoId: string) => void
  loading: boolean
}) {
  const t = messagesFor(locale).admin.draft
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open) }}
        disabled={entries.length === 0}
        className="cursor-pointer text-sm underline disabled:cursor-default disabled:text-ink-muted disabled:no-underline"
      >
        {entries.length === 0 ? t.undoEmpty : t.undo}
      </button>
      {open && entries.length > 0 && (
        <ul className="absolute right-0 z-20 mt-1 w-80 rounded-sm border border-line bg-white py-1 shadow">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 px-3 py-1 text-xs">
              <span>{stamp(entry.createdAt)}</span>
              <span className="text-ink-muted">{t.undoReason[entry.reason]}</span>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setOpen(false)
                  onPick(entry.id)
                }}
                className="cursor-pointer text-accent underline disabled:opacity-50"
              >
                {t.undoTake}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The day and minute, which is as fine as a stack ten deep ever needs. */
function stamp(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`
}
