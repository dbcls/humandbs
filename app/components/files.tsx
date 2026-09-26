import { Fragment, useRef, useState, type DragEvent, type ReactNode } from "react"
import { Form } from "react-router"

import { mapConcurrently } from "~/concurrency"
import { dayInJst } from "~/dates"
import {
  formatSize,
  isUploadableName,
  MULTIPART_CONCURRENCY,
  type ListedFile,
} from "~/files/prefix"
import type { FileLabel } from "~/files/labels"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { fileDownloadHref } from "~/admin/urls"
import { datasetPath, filePath, href } from "~/public/urls"
import { PAGE_SIZE, type PageSize } from "~/search/page-size"

import {
  Button,
  ButtonLink,
  Confirm,
  Dialog,
  Note,
  Progress,
  Stack,
  CopyButton,
} from "./base"
import { SlugEditor } from "./contents"
import { Editing, Field, LanguagePair, Submit, Unsaved } from "./form"
import { Icon } from "./icons"
import { DatasetIds, Paging, Table, Td } from "./page"
import { FileListTools } from "./search"
import { Flag, Stated } from "./flags"

/**
 * The download list, and the prefix behind it.
 *
 * One row is one node of a listed bucket. **A reader's list and a preview's are
 * the same component** — the difference is which bucket the caller listed, and a
 * line that is not public yet is shown by name with the address it will have,
 * never as something to fetch.
 */

export interface DownloadRow {
  name: string
  size: number
  isPublic: boolean
  /** The file's label in the page's language, or in the other where it has none. Empty for none. */
  label: string
}

/**
 * Where a published page's files are fetched from. A preview has none: its
 * files are not public yet.
 */
export interface PublicFileUrls {
  /** Where the addresses of every file in the list are fetched from, one to a line. */
  list: string
  /** The site's public origin, which a copied address is written on (`publicOrigin`). */
  origin: string
}

/**
 * The list of every file's address, for the end of the files section's name
 * row (`page.tsx` の `Section` の `end`): it acts on the whole list rather than
 * on the page of rows under it.
 */
export function UrlListLink({ locale, to }: { locale: Locale, to: string }) {
  return (
    <ButtonLink to={to} external download icon={<Icon name="download" />}>
      {messagesFor(locale).research.downloadUrlList}
    </ButtonLink>
  )
}

export function Downloads<Row extends DownloadRow>({
  locale,
  humLabel,
  rows,
  total,
  rangeFrom,
  rangeTo,
  page,
  pageCount,
  size,
  at,
  selectedBy,
  origin,
}: {
  locale: Locale
  /** Null while nothing has been pinned, which is only ever the case in a preview. */
  humLabel: string | null
  rows: readonly Row[]
  total: number
  /** 1-based positions of the shown rows within the whole prefix. */
  rangeFrom: number
  rangeTo: number
  page: number
  pageCount: number
  /** How many rows a page holds. */
  size: PageSize
  /** The address of a page under a page size, or the default size for `null`. */
  at: (page: number, size: PageSize | null) => string
  /**
   * The datasets that select a file, as the cell of its own column. Left out
   * where the list is one dataset's selection already — every row would name
   * the page it is on.
   */
  selectedBy?: (row: Row) => ReactNode
  /**
   * The site's public origin, given where every row is public: each row then
   * ends in a copy of its address, as the administrator's list of the prefix
   * does. A preview's rows are not public yet.
   */
  origin?: string
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const written = size === PAGE_SIZE ? null : size
  // **The tools are there once the list is longer than the smallest page**,
  // not once it has a second page: a reader who chose a hundred has one page
  // and still needs the choice to go back. At or under the smallest page there
  // is nothing to page or choose, and a count over a handful of rows reads as
  // a listing's tools on a page's section.
  const tools = total > PAGE_SIZE

  return (
    <Stack gap="tight">
      {tools && (
        <FileListTools
          locale={locale}
          size={size}
          at={(chosen) => at(1, chosen)}
          paging={{ total, from: rangeFrom, to: rangeTo, page, pageCount, at: (to) => at(to, written) }}
        />
      )}
      {/* `whenEmpty` は要らない — 配布するものが無い研究では、この節ごと描かれない
          (`research.tsx` / `dataset.tsx`)。 */}
      {/* **The label's column is there on every list**, labelled or not: the
          columns of a research's list and of any other are then the same ones
          in the same places. */}
      <Table
        headers={[
          t.downloadName,
          t.downloadLabel,
          t.downloadSize,
          ...(selectedBy === undefined ? [] : [messages.dataset.datasetId]),
        ]}
        actions={origin === undefined ? undefined : t.copyUrl}
      >
        {rows.map((row) => (
          <tr key={row.name}>
            <Td>
              {/* **A name that fetches is shown with the download icon** — pressing it
                  starts a download rather than opening a page, and the indicator shows
                  so before the press. A name not public yet fetches nothing and
                  goes without. */}
              {row.isPublic && humLabel !== null
                ? (
                    <a href={filePath(humLabel, row.name)} className="visitable">
                      <Icon name="download" aria-hidden="true" className="mr-1" />
                      <FileName name={row.name} />
                    </a>
                  )
                : <NotPublicYet locale={locale} humLabel={humLabel} name={row.name} />}
            </Td>
            <Td floor="min-w-40">{row.label}</Td>
            <Td nowrap className="tabular-nums">{formatSize(row.size)}</Td>
            {selectedBy !== undefined && <Td nowrap>{selectedBy(row)}</Td>}
            {origin !== undefined && (
              <Td nowrap holds="control">
                {row.isPublic && humLabel !== null && (
                  <CopyAddress address={filePath(humLabel, row.name)} origin={origin} locale={locale} />
                )}
              </Td>
            )}
          </tr>
        ))}
      </Table>
      {/* Under the table the page steps alone, as under a listing: the choice of
          size is made once, above, before the rows are read. */}
      {pageCount > 1 && (
        <div className="flex justify-end">
          <Paging
            locale={locale}
            total={total}
            from={rangeFrom}
            to={rangeTo}
            page={page}
            pageCount={pageCount}
            at={(to) => at(to, written)}
            inPlace
          />
        </div>
      )}
    </Stack>
  )
}

/**
 * A file the reviewer can see the name of but not the bytes of. The address it
 * will have is written out as text, because that is the thing being confirmed —
 * handing over a signature instead would put the private bucket behind a link
 * that anybody holding the share link could follow.
 */
function NotPublicYet({ locale, humLabel, name }: {
  locale: Locale
  humLabel: string | null
  name: string
}) {
  const t = messagesFor(locale).preview
  return (
    <Stack gap="tight">
      <span>
        <FileName name={name} />
        {" "}
        <Flag kind="hidden">{t.fileNotPublic}</Flag>
      </span>
      {humLabel !== null && (
        <span className="text-ink-muted text-xs">
          {`${t.fileWillBeAt}: `}
          <FileName name={filePath(humLabel, name)} />
        </span>
      )}
    </Stack>
  )
}

/**
 * The prefix as an administrator works with it: both buckets in one list, and
 * every act on the row it acts on.
 *
 * **Nothing is chosen and then acted on from the foot of the table.** A press
 * that identifies nothing, over rows that have scrolled, is the way to switch or
 * delete the wrong file; the one place several files are made public at once
 * is the publish confirmation, which sends its own list.
 *
 * **The name is not pressed.** A public file opens as a download, and a fetch
 * that starts because a name was read is not one the reader decided on; the
 * download is shown beside the name as an act of its own, and a file nobody
 * outside can reach offers neither it nor its address.
 */
export function FileTable({ locale, researchId, rows, humLabel, origin, whenEmpty, selectedBy, labels }: {
  locale: Locale
  /** The research whose prefix this is: a private file is fetched through it. */
  researchId: string
  rows: readonly ListedFile[]
  humLabel: string | null
  /** The site's public origin, which a copied address is written on. */
  origin: string
  /** What to show in place of the rows when there are none. The prefix's own word by default. */
  whenEmpty?: string
  /**
   * The published datasets that select each file, by its name — the column the
   * research's public download list has. Left out, the table has no such column.
   */
  selectedBy?: Readonly<Record<string, readonly string[]>>
  /** The files' labels, by name. A file with none is not a key. */
  labels: Readonly<Record<string, FileLabel>>
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.files

  return (
    <Table
      actions
      // No cell of a row runs to a second line but the name, and the row
      // holds controls a line taller than its words.
      align="middle"
      headers={[
        t.name,
        t.labelJa,
        t.labelEn,
        t.size,
        ...(selectedBy === undefined ? [] : [messages.dataset.datasetId]),
        t.updatedAt,
        t.state,
      ]}
      whenEmpty={whenEmpty ?? t.empty}
    >
      {rows.map((row) => (
        <FileRow
          key={row.name}
          row={row}
          label={labels[row.name]}
          researchId={researchId}
          humLabel={humLabel}
          origin={origin}
          locale={locale}
          selectedBy={selectedBy === undefined ? undefined : (selectedBy[row.name] ?? [])}
        />
      ))}
    </Table>
  )
}

/**
 * One file, and the six things done to it: fetched, its address copied,
 * switched to the other side, renamed, labelled, deleted.
 *
 * **The switch is one control that offers the other side.** Which side the
 * file is on, the row already shows; the control shows where a press would
 * take it. **While a switch runs it shows that and cannot be pressed** — the
 * bytes are being copied and a second wish in the meantime would only be
 * queued behind the first. Renaming waits for the same reason: which side to
 * rename on is not settled.
 *
 * **Renaming a public file moves its address**, which is the break deleting it
 * makes, so the trigger uses the same style and the same panel every slug is
 * changed in (`SlugEditor`).
 *
 * **A label is edited at any time, switch or not**: it is kept by the file's
 * name, which a switch does not change.
 */
function FileRow({ row, label, researchId, humLabel, origin, locale, selectedBy }: {
  row: ListedFile
  label: FileLabel | undefined
  researchId: string
  humLabel: string | null
  origin: string
  locale: Locale
  selectedBy: readonly string[] | undefined
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.files
  const address = humLabel === null ? null : filePath(humLabel, row.name)
  const reachable = row.isPublic && address !== null
  // A private file has no address a reader could use. It is fetched through a
  // route that checks who is asking and redirects to a signed address of the
  // store, good for a few minutes.
  const fetchedFrom = reachable ? address : row.isPublic ? null : fileDownloadHref(researchId, row.name)
  const running = row.pending !== null && !row.pending.failed
  const switching = running
    ? t.switchingReason(row.pending?.action === "publish" ? t.movingToPublic : t.movingToPrivate)
    : undefined

  return (
    <tr>
      <Td floor="min-w-56"><FileName name={row.name} /></Td>
      <Td floor="min-w-40">{label?.ja}</Td>
      <Td floor="min-w-40">{label?.en}</Td>
      <Td nowrap className="tabular-nums">{formatSize(row.size)}</Td>
      {selectedBy !== undefined && (
        <Td nowrap>
          {/* A published dataset has a public page, and it opens in a new tab
              the way the research listing's dataset IDs do: the curator is
              working down this prefix and would lose the row. */}
          {selectedBy.length > 0 && (
            <DatasetIds
              newTab
              locale={locale}
              items={selectedBy.map((label) => ({ label, to: href(locale, datasetPath(label)) }))}
            />
          )}
        </Td>
      )}
      <Td nowrap>{dayInJst(row.updatedAt)}</Td>
      <Td nowrap>
        <State locale={locale} entry={row} />
      </Td>
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          {fetchedFrom !== null && (
            <ButtonLink
              to={fetchedFrom}
              external
              download
              size="row"
              icon={<Icon name="download" />}
            >
              {t.download}
            </ButtonLink>
          )}
          {reachable && <CopyAddress address={address} origin={origin} locale={locale} />}
          <Form method="post">
            <input type="hidden" name="name" value={row.name} />
            <Submit
              intent={row.isPublic ? "unpublish" : "publish"}
              size="row"
              icon={<Icon name={row.isPublic ? "lock" : "upload"} />}
              disabled={switching}
            >
              {running ? t.switchingNow : row.isPublic ? t.unpublish : t.publish}
            </Submit>
          </Form>
          <Form method="post">
            <input type="hidden" name="from" value={row.name} />
            <SlugEditor
              locale={locale}
              intent="rename"
              name="to"
              value={row.name}
              hint={t.renameHint}
              size="row"
              disabled={running ? t.renameSwitching : undefined}
            />
          </Form>
          <Editing method="post">
            <input type="hidden" name="name" value={row.name} />
            <Dialog
              label={t.editLabel}
              title={t.editLabelTitle(row.name)}
              note={t.labelNote}
              size="row"
              icon={<Icon name="edit" />}
              action={() => (
                <Submit intent="label" icon={<Icon name="save" />} saves>
                  {t.saveLabel}
                </Submit>
              )}
              status={<Unsaved locale={locale} />}
            >
              <LanguagePair>
                <Field label={t.labelJa} name="labelJa" value={label?.ja ?? ""} width="w-full" />
                <Field label={t.labelEn} name="labelEn" value={label?.en ?? ""} width="w-full" />
              </LanguagePair>
            </Dialog>
          </Editing>
          <Form method="post">
            <input type="hidden" name="name" value={row.name} />
            <Confirm
              label={t.delete}
              title={t.deleteTitle(row.name)}
              warning={t.deleteWarning}
              confirm={t.deleteConfirm}
              intent="delete"
              size="row"
              disabled={running ? t.deleteSwitching : undefined}
            />
          </Form>
        </span>
      </Td>
    </tr>
  )
}

/**
 * Which side the file is on. **A switch that failed is said here**, with the
 * store's own words: the control beside it is pressable again, and the reason
 * the last press did not take is what decides whether to press it.
 */
function State({ locale, entry }: { locale: Locale, entry: ListedFile }) {
  const t = messagesFor(locale).admin.files
  // Every row has a side, so the side is an indicator and a word rather than a box;
  // only a failure is a box.
  const side = entry.isPublic
    ? <Stated kind="live">{t.isPublic}</Stated>
    : <Stated kind="hidden">{t.isPrivate}</Stated>
  if (entry.pending?.failed !== true) return side
  return (
    <span className="flex flex-wrap items-center gap-2">
      {side}
      <Flag kind="stops">
        {t.failed}
        {/* The store's own words, untranslated: a message nobody wrote cannot be. */}
        {entry.pending.lastError !== null && (
          <span className="ml-1 text-ink-muted">{entry.pending.lastError}</span>
        )}
      </Flag>
    </span>
  )
}

interface UploadProgress {
  name: string
  /** Whole percent, so a re-render is not provoked by every chunk. */
  percent: number
  failed: boolean
}

/**
 * Sending files to the store.
 *
 * **The bytes go straight there.** The server is asked for a signature, and
 * what comes back accepts exactly one file: this key, this type, this many
 * bytes. Anything larger than the threshold is split into parts, and only the
 * parts are signed — beginning and completing need credentials this page does
 * not have.
 *
 * **A name the prefix already holds is asked about before anything is sent.** The
 * name is the key, so sending it again replaces what is there and nothing brings
 * that back; the server is asked which of the chosen names are there, and only
 * those are put to the reader, in one question for the whole choice. A choice
 * with no such name is sent without a word. The question is a `Confirm` held
 * open by the choice itself: nothing was pressed to open it, so it has no way
 * in of its own.
 *
 * There is no resume. Closing the page abandons whatever is in flight, and the
 * file is sent again from the beginning under the same name — which, being the
 * same name, is asked about again.
 *
 * **The chooser stays a plain input rather than `FileField`.** What sends the
 * bytes is this component, not a form submission, so there is nothing for
 * `FileField`'s uncontrolled shape to attach to — the change handler has to run
 * on selection, and the sending state has to disable the input while it runs.
 */
export function UploadPanel({ locale, endpoint, threshold, partSize, hint }: {
  locale: Locale
  /** Where the signatures are asked for. The prefix is whatever responds there. */
  endpoint: string
  threshold: number
  partSize: number
  /**
   * What becomes of a file put here, where the screen has not already said it.
   * The article assets say nothing: that prefix is public, which is what the whole
   * screen is about.
   */
  hint?: string
}) {
  const t = messagesFor(locale).admin.files
  const [progress, setProgress] = useState<UploadProgress[]>([])
  const [done, setDone] = useState(false)
  const [badName, setBadName] = useState(false)
  const [folder, setFolder] = useState(false)
  const [over, setOver] = useState(false)
  /** Whether the server is being asked which names it already holds. */
  const [asking, setAsking] = useState(false)
  /** The question could not be put, so nothing was sent. */
  const [unchecked, setUnchecked] = useState(false)
  /**
   * A choice waiting on the reader's answer: the files, and the names among
   * them the prefix already holds. Null while nothing is being asked.
   */
  const [pending, setPending] = useState<{ files: File[], existing: string[] } | null>(null)
  const aborter = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  /**
   * How deep inside the panel the pointer is.
   *
   * **`dragenter` and `dragleave` fire again for every descendant it crosses**,
   * so whether it is still inside is a count of the two rather than the last
   * event seen. A ref rather than state: the pair arrives in one gesture and
   * two updates batched together would cancel out.
   */
  const depth = useRef(0)

  /** Forgets the choice, so choosing the same files again is a new change. */
  const forgetChoice = () => {
    if (input.current !== null) input.current.value = ""
  }

  const send = async (files: File[]) => {
    setDone(false)
    setUnchecked(false)
    setBadName(files.some((file) => !isUploadableName(file.name)))
    const sendable = files.filter((file) => isUploadableName(file.name))
    if (sendable.length === 0) return

    setAsking(true)
    let existing: string[]
    try {
      existing = await whichExist(endpoint, sendable.map((file) => file.name))
    } catch {
      // Not knowing is not the same as knowing there is nothing there: the
      // choice is dropped rather than sent over whatever it might replace.
      setAsking(false)
      setUnchecked(true)
      forgetChoice()
      return
    }
    setAsking(false)
    if (existing.length > 0) {
      setPending({ files: sendable, existing })
      return
    }
    await transfer(sendable)
  }

  const transfer = async (sendable: File[]) => {
    const controller = new AbortController()
    aborter.current = controller
    setProgress(sendable.map((file) => ({ name: file.name, percent: 0, failed: false })))

    for (const file of sendable) {
      const at = (percent: number) => {
        setProgress((rows) => rows.map((row) =>
          row.name === file.name ? { ...row, percent } : row))
      }
      try {
        await sendOne(endpoint, file, { threshold, partSize }, at, controller.signal)
      } catch {
        setProgress((rows) => rows.map((row) =>
          row.name === file.name ? { ...row, failed: true } : row))
      }
    }

    aborter.current = null
    setProgress([])
    setDone(true)
    forgetChoice()
    // The listing is read on the server, so what was just sent appears by
    // requesting the page again rather than by patching the table.
    window.location.reload()
  }

  const sending = progress.length > 0
  // Nothing more is taken while a choice is being asked about, on the server
  // or of the reader — a second drop in the meantime would be a second answer
  // to the same question.
  const busy = sending || asking || pending !== null

  /** Whether what is being dragged is files at all, rather than a selection. */
  const holdsFiles = (event: DragEvent<HTMLDivElement>): boolean =>
    [...event.dataTransfer.types].includes("Files")

  // **Both `dragenter` and `dragover` have to refuse the default**, or the drop
  // never fires: not refusing it is how the page shows it does not take files.
  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!holdsFiles(event)) return
    event.preventDefault()
    depth.current += 1
    if (!busy) setOver(true)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!holdsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = busy ? "none" : "copy"
  }

  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setOver(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current = 0
    setOver(false)
    if (busy) return
    /*
      **A folder arrives as an entry with nothing to send behind it.** A prefix is
      flat and nothing here walks into one, so what a folder gets is the reason
      rather than silence — dropped files and a dropped folder both leave the
      same empty panel otherwise.

      The entries are read now, in the drop itself: what the transfer holds is
      only guaranteed for the length of this event.
    */
    const items = [...event.dataTransfer.items]
    const entries = items.map((item) => item.webkitGetAsEntry())
    setFolder(entries.some((entry) => entry?.isDirectory === true))
    const dropped = entries.some((entry) => entry !== null)
      ? items.flatMap((item, at) => {
          if (entries[at]?.isFile !== true) return []
          const file = item.getAsFile()
          return file === null ? [] : [file]
        })
      : [...event.dataTransfer.files]
    if (dropped.length > 0) void send(dropped)
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      /* **The edge shows it is a target, and shows it without moving anything.**
         A border that thickened under the pointer would shift every line inside
         the panel by a pixel at the moment the reader is aiming at it. */
      className={`rounded border px-4 py-3 ${over ? "border-brand border-dashed bg-surface-hover" : "border-line"}`}
    >
      <Stack gap="normal">
        {/*
          **The panel shows what it is, rather than letting the browser say it.**
          A bare file input draws its own control and its own words — a button
          reading "Choose Files" beside "No file chosen" — and the second of
          those is the panel's whole message at rest: that nothing has happened
          yet, which the reader can already see. The input is still the thing
          that opens the picker; it is only kept out of sight, and the button
          presses it.
        */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Icon name="upload" className="text-3xl text-ink-muted" aria-hidden="true" />
          {/* **The sentence and what follows it are one block, in one size.**
              What becomes of a file is the second half of what the panel shows,
              not a footnote to it: the same 14px, the quieter colour, and the
              gap of lines within a paragraph rather than the gap between
              things. */}
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold text-ink">{t.uploadDrop}</p>
            {hint !== undefined && <p className="text-ink-muted">{hint}</p>}
          </div>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              setFolder(false)
              void send([...event.target.files ?? []])
            }}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              icon={<Icon name="file" />}
              disabled={busy}
              onClick={() => { input.current?.click() }}
            >
              {t.chooseFiles}
            </Button>
            {sending && (
              <Button type="button" variant="secondary" onClick={() => { aborter.current?.abort() }}>
                {messagesFor(locale).admin.cancel}
              </Button>
            )}
          </div>
        </div>
        {/* **The names are in the sentence, not in a list of their own**: the
            question is about those names, and a reader deciding whether to
            press is deciding about exactly them. */}
        <Confirm
          held={{
            open: pending !== null,
            close: () => {
              setPending(null)
              forgetChoice()
            },
          }}
          title={t.overwriteTitle}
          warning={t.overwriteWarning(pending?.existing.length ?? 0, pending?.existing.join(", ") ?? "")}
          confirm={t.overwrite}
          icon="upload"
          onConfirm={() => {
            if (pending !== null) void transfer(pending.files)
          }}
        />
        {folder && <Note kind="danger">{t.uploadFolder}</Note>}
        {badName && <Note kind="danger">{t.uploadBadName}</Note>}
        {unchecked && <Note kind="danger">{t.uploadCheckFailed}</Note>}
        {done && <Note kind="done">{t.uploadDone}</Note>}
        {progress.map((row) => (
          row.failed
            ? <Note key={row.name} kind="danger">{t.uploadFailed(row.name)}</Note>
            : <Progress key={row.name} label={t.uploading(row.name, row.percent)} done={row.percent} total={100} />
        ))}
      </Stack>
    </div>
  )
}

/**
 * A file's name, broken only after `/` and `_`.
 *
 * **A name is not cut inside a word.** Names are long runs of letters with no
 * spaces, and letting the browser break anywhere split `variant_counts` into
 * `variant_c` and `ounts`. After a separator the two halves still read as parts
 * of the name; a part too long for the column widens the column rather than
 * being cut.
 */
export function FileName({ name }: { name: string }) {
  const parts = name.split(/(?<=.[/_])/)
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {at > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/**
 * The way to copy the address a file is served at.
 *
 * **What is copied is the whole URL**, on the site's public origin — the one
 * the share link is written on — rather than the host of the screen it is
 * copied from, so an address copied on a server reached by another name still
 * opens for whoever it is handed to. The URL is shown to a pointer, since the
 * row names the file rather than the address.
 */
export function CopyAddress({ address, origin, locale }: { address: string, origin: string, locale: Locale }) {
  const messages = messagesFor(locale)
  const url = new URL(address, origin).href
  return (
    <CopyButton
      size="row"
      text={url}
      title={url}
      label={messages.research.copyUrl}
      done={messages.copied}
      byHand={messages.copyByHand}
    />
  )
}

interface UploadShape {
  threshold: number
  partSize: number
}

async function sendOne(
  endpoint: string,
  file: File,
  shape: UploadShape,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const contentType = file.type === "" ? "application/octet-stream" : file.type

  if (file.size <= shape.threshold) {
    const answer = await ask(endpoint, {
      kind: "single",
      name: file.name,
      size: file.size,
      contentType,
    }, signal)
    if (answer.kind !== "single") throw new Error("the server answered with the wrong shape")
    await put(answer.url, file, contentType, onProgress, signal)
    onProgress(100)
    return
  }

  const partCount = Math.ceil(file.size / shape.partSize)
  const begun = await ask(endpoint, {
    kind: "begin",
    name: file.name,
    size: file.size,
    contentType,
    partCount,
  }, signal)
  if (begun.kind !== "begin") throw new Error("the server answered with the wrong shape")

  try {
    const parts = await sendParts(file, shape.partSize, begun.urls, onProgress, signal)
    await ask(endpoint, {
      kind: "complete",
      name: file.name,
      uploadId: begun.uploadId,
      parts,
    }, signal)
    onProgress(100)
  } catch (error) {
    // The store keeps the parts of an upload nobody finished, so an abandoned
    // one is told to forget them rather than left to be found later.
    await ask(endpoint, {
      kind: "abort",
      name: file.name,
      uploadId: begun.uploadId,
    }, undefined).catch(() => undefined)
    throw error
  }
}

interface UploadedPart {
  partNumber: number
  etag: string
}

/**
 * The parts, a few at a time. Four is where measured throughput stops rising;
 * beyond that the same store bandwidth is only divided differently.
 */
async function sendParts(
  file: File,
  partSize: number,
  urls: readonly string[],
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<UploadedPart[]> {
  const sentOf = new Map<number, number>()
  const report = () => {
    const sent = [...sentOf.values()].reduce((total, value) => total + value, 0)
    onProgress(Math.min(99, Math.floor((sent / file.size) * 100)))
  }

  return mapConcurrently(urls, MULTIPART_CONCURRENCY, async (url, index) => {
    const from = index * partSize
    const blob = file.slice(from, Math.min(from + partSize, file.size))
    const etag = await put(url, blob, "", (percent) => {
      sentOf.set(index, (blob.size * percent) / 100)
      report()
    }, signal)
    sentOf.set(index, blob.size)
    report()
    if (etag === null) throw new Error("the store returned no ETag for a part")
    return { partNumber: index + 1, etag }
  })
}

/**
 * A PUT that reports how far it has got, which `fetch` cannot do. The length is
 * set by the browser from the body, and the signature was made for exactly that
 * length, so a truncated send is refused by the store rather than accepted.
 */
function put(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("PUT", url)
    if (contentType !== "") request.setRequestHeader("Content-Type", contentType)
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.floor((event.loaded / event.total) * 100))
    })
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.getResponseHeader("ETag"))
      } else {
        reject(new Error(`the store refused the upload (${request.status})`))
      }
    })
    request.addEventListener("error", () => {
      reject(new Error("the upload did not reach the store"))
    })
    request.addEventListener("abort", () => {
      reject(new Error("the upload was stopped"))
    })
    signal.addEventListener("abort", () => {
      request.abort()
    }, { once: true })
    request.send(body)
  })
}

type UploadAsk
  = | { kind: "check", names: string[] }
    | { kind: "single", name: string, size: number, contentType: string }
    | { kind: "begin", name: string, size: number, contentType: string, partCount: number }
    | { kind: "complete", name: string, uploadId: string, parts: UploadedPart[] }
    | { kind: "abort", name: string, uploadId: string }

interface UploadAnswer {
  kind: string
  existing?: string[]
  url?: string
  uploadId?: string
  urls?: string[]
}

/** Which of the names the prefix already holds, as the server lists them. */
async function whichExist(endpoint: string, names: string[]): Promise<string[]> {
  const answer = await ask(endpoint, { kind: "check", names }, undefined)
  if (answer.kind !== "check") throw new Error("the server answered with the wrong shape")
  return answer.existing
}

async function ask(
  endpoint: string,
  body: UploadAsk,
  signal: AbortSignal | undefined,
): Promise<
  | { kind: "check", existing: string[] }
  | { kind: "single", url: string }
  | { kind: "begin", uploadId: string, urls: string[] }
  | { kind: "done" }
> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`the server refused the upload (${response.status})`)
  const answer = await response.json() as UploadAnswer
  if (answer.kind === "check" && answer.existing !== undefined) {
    return { kind: "check", existing: answer.existing }
  }
  if (answer.kind === "single" && answer.url !== undefined) {
    return { kind: "single", url: answer.url }
  }
  if (answer.kind === "begin" && answer.uploadId !== undefined && answer.urls !== undefined) {
    return { kind: "begin", uploadId: answer.uploadId, urls: answer.urls }
  }
  return { kind: "done" }
}
