import { useState } from "react"

import { dayInJst } from "~/dates"
import { formatSize, type ListedFile } from "~/files/prefix"
import { inListingOrder } from "~/files/selection"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Button, ButtonLink, Dialog, PANE_LABEL, Stack } from "./base"
import { Stated } from "./flags"
import { FileName } from "./files"
import { CONTROL } from "./form"
import { Icon } from "./icons"
import { Empty, Table, Td } from "./page"

/**
 * Which of the research's files a dataset's page lists.
 *
 * **The form shows only how many, and the table is in the panel.** What is
 * chosen is read on the page beside the form, and the panel is where it is
 * changed: the prefix's table with a checkbox at the front of each row, the
 * ones chosen already ticked. **Ticking changes nothing until the panel's own
 * action** — a reader running down the rows is still deciding, and the form and
 * the page beside it would redraw at every tick; the cancel button leaves the choice
 * as it was.
 *
 * **The link to the files screen is shown beside it, in a new tab** — a file not
 * yet uploaded is added there, and the form here is not left unsaved.
 */
export function FileSelection({ locale, listing, selected, filesAt, onChange }: {
  locale: Locale
  /** Null when the store did not respond, which offers nothing rather than nothing existing. */
  listing: readonly ListedFile[] | null
  selected: readonly string[]
  /** The research's files screen. */
  filesAt: string
  onChange: (selection: string[]) => void
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.datasetEditor
  const [open, setOpen] = useState(false)
  const [ticked, setTicked] = useState<readonly string[]>(selected)
  const [filter, setFilter] = useState("")

  const way = (
    <ButtonLink
      to={filesAt}
      external
      newTab
      newTabLabel={messages.newTab}
      size="row"
    >
      {messages.admin.detail.openFiles}
    </ButtonLink>
  )

  if (listing === null) {
    return (
      <Stack gap="normal">
        <Empty>{t.filesUnavailable}</Empty>
        <span className="flex">{way}</span>
      </Stack>
    )
  }

  const listed = new Set(listing.map((entry) => entry.name))
  const linked = selected.filter((name) => listed.has(name)).length

  return (
    <Stack gap="normal">
      <p className="text-sm">{linked === 0 ? t.filesNone : t.filesLinked(linked)}</p>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          icon={<Icon name="link" />}
          disabled={listing.length === 0 ? t.filesEmpty : undefined}
          onClick={() => {
            setTicked(selected)
            setFilter("")
            setOpen(true)
          }}
        >
          {t.linkFiles}
        </Button>
        {way}
      </span>
      <Dialog
        held={{ open, close: () => { setOpen(false) } }}
        title={t.linkFiles}
        note={t.linkFilesNote}
        wide
        action={(close) => (
          <Button
            type="button"
            variant="primary"
            icon={<Icon name="link" />}
            onClick={() => {
              onChange(inListingOrder(ticked))
              close()
            }}
          >
            {t.linkFilesConfirm}
          </Button>
        )}
      >
        <FilePicker
          locale={locale}
          listing={listing}
          ticked={ticked}
          filter={filter}
          onFilter={setFilter}
          onTick={setTicked}
        />
      </Dialog>
    </Stack>
  )
}

/**
 * The prefix as its own screen draws it — name, size, date, side — with a checkbox
 * at the front of each row and a window over them that narrows by name.
 *
 * **The checkbox in the table header takes every row the window shows, or none**, and shows
 * when only some are: a dataset often has every file of a small prefix, and the
 * rows the window hides are not what the reader is looking at.
 */
export function FilePicker({ locale, listing, ticked, filter, onFilter, onTick }: {
  locale: Locale
  listing: readonly ListedFile[]
  ticked: readonly string[]
  filter: string
  onFilter: (filter: string) => void
  onTick: (ticked: string[]) => void
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.datasetEditor
  const files = messages.admin.files

  const words = filter.toLowerCase().split(/\s+/).filter((word) => word !== "")
  const shown = listing.filter((entry) =>
    words.every((word) => entry.name.toLowerCase().includes(word)))
  const names = shown.map((entry) => entry.name)
  const chosen = names.filter((name) => ticked.includes(name)).length
  // What the window hides stays as it is either way: the table header's checkbox represents
  // the rows on screen and nothing else.
  const others = ticked.filter((name) => !names.includes(name))

  return (
    <Stack gap="normal">
      {/* A plain, controlled input: the rows narrow on every keystroke. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className={PANE_LABEL}>{t.filterFiles}</span>
        <input
          type="search"
          value={filter}
          onChange={(event) => { onFilter(event.target.value) }}
          className={`${CONTROL} w-64`}
        />
      </label>
      <Table
        align="middle"
        headers={[
          <input
            key="pick"
            type="checkbox"
            aria-label={t.pickAllFiles}
            checked={names.length > 0 && chosen === names.length}
            disabled={names.length === 0}
            ref={(input) => { if (input !== null) input.indeterminate = chosen > 0 && chosen < names.length }}
            onChange={(event) => { onTick(event.target.checked ? [...others, ...names] : others) }}
          />,
          files.name,
          { text: files.size, align: "right" },
          files.updatedAt,
          files.state,
        ]}
        whenEmpty={t.filesNoMatch}
      >
        {shown.map((entry) => (
          <tr key={entry.name}>
            <Td holds="icon">
              <input
                type="checkbox"
                aria-label={entry.name}
                checked={ticked.includes(entry.name)}
                onChange={(event) => {
                  onTick(event.target.checked
                    ? [...ticked, entry.name]
                    : ticked.filter((name) => name !== entry.name))
                }}
              />
            </Td>
            <Td floor="min-w-56"><FileName name={entry.name} /></Td>
            <Td nowrap className="text-right tabular-nums">{formatSize(entry.size)}</Td>
            <Td nowrap>{dayInJst(entry.updatedAt)}</Td>
            <Td nowrap>
              {entry.isPublic
                ? <Stated kind="live">{files.isPublic}</Stated>
                : <Stated kind="hidden">{files.isPrivate}</Stated>}
            </Td>
          </tr>
        ))}
      </Table>
    </Stack>
  )
}
