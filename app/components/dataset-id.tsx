import { useState } from "react"

import { nhaId, nhaNumber } from "~/admin/labels"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Button } from "./base"
import { CONTROL, CONTROL_ROW, Submit } from "./form"
import { Icon } from "./icons"

/**
 * The box a dataset's id is given in, and the two ways into it.
 *
 * **Issuing does not pin.** It puts the next NHA id into the box and shuts the
 * box, and「割り当て」settles it like a typed accession — the one operation that
 * gives a row its id, so pressing「NHA ID の発行」and leaving costs no number.
 * The number shown is read when the screen was drawn; the server reads it again
 * when the id is given, and the answer names the one given.「キャンセル」opens
 * the box to typing again.
 *
 * **「NHA ID の発行」never submits.** A submit that issued outright when the
 * script had not yet taken the button over would pin on a press made before the
 * screen was ready — the one thing the button promises not to do.
 */
export function IdForm({ nextNhaId, locale, onIssuing, size }: {
  /** What the box shows while issuing. */
  nextNhaId: string | null
  locale: Locale
  /** `row` inside a table's row, where the box and the buttons take the row's height. */
  size?: "row"
  /** Told when the box starts or stops showing an issue, for a screen that counts rows. */
  onIssuing?: (issuing: boolean) => void
}) {
  const messages = messagesFor(locale)
  const detail = messages.admin.detail
  const [issuing, setIssuingState] = useState(false)
  const setIssuing = (next: boolean) => {
    setIssuingState(next)
    onIssuing?.(next)
  }

  return (
    <>
      {/* An empty id is refused before it is sent: the ledger has nothing to
          say about "", and the server answers it as a row that is not there. */}
      <input
        key={issuing ? "issuing" : "typing"}
        type="text"
        name="label"
        aria-label={messages.admin.datasetEditor.idHeading}
        {...(issuing ? { value: nextNhaId ?? "", readOnly: true } : {})}
        disabled={issuing}
        required={!issuing}
        placeholder={detail.pinDatasetPlaceholder}
        className={`${size === "row" ? CONTROL_ROW : `${CONTROL} text-sm`} w-48 disabled:opacity-50`}
      />
      <Submit intent={issuing ? "issue" : "pin"} size={size} icon={<Icon name="link" />}>{detail.pinSubmit}</Submit>
      {issuing
        ? <Button type="button" size={size} onClick={() => { setIssuing(false) }}>{detail.cancel}</Button>
        : (
            <Button
              type="button"
              size={size}
              icon={<Icon name="plus" />}
              onClick={() => { setIssuing(true) }}
            >
              {detail.issueNha}
            </Button>
          )}
    </>
  )
}

/**
 * What a row's box shows while issuing, on a screen with several rows missing
 * an id. The rows count on from the next number in the order they were
 * pressed, so no two rows show the same number; a row not yet pressed shows
 * the number it would take. Null when there is no number to show.
 */
export function shownNhaId(
  next: string | null,
  /** The rows shown issuing, in the order they were pressed. */
  issuing: readonly string[],
  row: string,
): string | null {
  const base = next === null ? null : nhaNumber(next)
  if (base === null) return null
  const at = issuing.indexOf(row)
  return nhaId(base + (at === -1 ? issuing.length : at))
}
