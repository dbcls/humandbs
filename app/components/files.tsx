import { useRef, useState } from "react"
import { Form } from "react-router"

import { mapConcurrently } from "~/concurrency"
import {
  formatSize,
  isUploadableName,
  MULTIPART_CONCURRENCY,
  type BoxEntry,
} from "~/files/box"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { filePath } from "~/public/urls"

import { Badge, Button, Confirm, Fold, IconButton, Note, Progress, Stack } from "./base"
import { CONTROL, SelectAll, Submit } from "./form"
import { Empty, PageLinks, Table, Td } from "./page"

/**
 * The download list, and the box behind it.
 *
 * One row is one node of a listed bucket. **A reader's list and a preview's are
 * the same component** — the difference is which bucket the caller listed, and a
 * line that is not public yet is shown by name with the address it will have,
 * never as something to fetch (docs/editing.md の「レビュー」).
 */

export interface DownloadRow {
  name: string
  size: number
  isPublic: boolean
}

export function Downloads({ locale, humLabel, rows, total, page, pageCount, at }: {
  locale: Locale
  /** Null while nothing has been pinned, which is only ever the case in a preview. */
  humLabel: string | null
  rows: readonly DownloadRow[]
  total: number
  page: number
  pageCount: number
  at: (page: number) => string
}) {
  const messages = messagesFor(locale)
  const t = messages.research

  return (
    <Stack gap="tight">
      <p className="text-ink-muted text-sm">{t.fileCount(total)}</p>
      <Table headers={[t.downloadName, t.downloadSize]}>
        {rows.map((row) => (
          <tr key={row.name}>
            <Td className="break-all">
              {row.isPublic && humLabel !== null
                ? <a href={filePath(humLabel, row.name)}>{row.name}</a>
                : <NotPublicYet locale={locale} humLabel={humLabel} name={row.name} />}
            </Td>
            <Td className="whitespace-nowrap text-right">{formatSize(row.size)}</Td>
          </tr>
        ))}
      </Table>
      <PageLinks
        label={messages.search.pagination}
        page={page}
        pageCount={pageCount}
        at={at}
        previous={messages.search.previousPage}
        next={messages.search.nextPage}
      />
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
        {name}
        {" "}
        <Badge>{t.fileNotPublic}</Badge>
      </span>
      {humLabel !== null && (
        <span className="text-ink-muted text-xs">
          {`${t.fileWillBeAt}: ${filePath(humLabel, name)}`}
        </span>
      )}
    </Stack>
  )
}

/**
 * The box as an administrator works with it: both buckets in one list, with the
 * switches that have not finished marked on the lines they apply to.
 *
 * Switching and deleting take a selection, because that is how the work
 * actually arrives — the publish screen sends people here with a list of files
 * to make public, not with one.
 */
export function BoxTable({ locale, rows, humLabel }: {
  locale: Locale
  rows: readonly BoxEntry[]
  humLabel: string | null
}) {
  const t = messagesFor(locale).admin.files

  if (rows.length === 0) return <Empty>{t.empty}</Empty>

  return (
    <Form method="post">
      <Stack gap="normal">
        <Table headers={[<SelectAll key="all" name="name" label={t.selectAll} />, t.name, t.size, t.updatedAt, t.state]}>
          {rows.map((row) => (
            <tr key={row.name}>
              <Td>
                <input type="checkbox" name="name" value={row.name} aria-label={row.name} />
              </Td>
              <Td className="break-all">
                {row.isPublic && humLabel !== null
                  ? <a href={filePath(humLabel, row.name)}>{row.name}</a>
                  : row.name}
              </Td>
              <Td className="whitespace-nowrap text-right">{formatSize(row.size)}</Td>
              <Td className="whitespace-nowrap">{row.updatedAt.slice(0, 10)}</Td>
              <Td className="whitespace-nowrap">
                <State locale={locale} entry={row} />
              </Td>
            </tr>
          ))}
        </Table>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Submit intent="publish" variant="secondary">{t.publish}</Submit>
          <Submit intent="unpublish" variant="secondary">{t.unpublish}</Submit>
          <Confirm label={t.delete} warning={t.deleteWarning} confirm={t.deleteConfirm} cancel={t.cancel}>
            <input type="hidden" name="intent" value="delete" />
          </Confirm>
        </div>
      </Stack>
    </Form>
  )
}

function State({ locale, entry }: { locale: Locale, entry: BoxEntry }) {
  const t = messagesFor(locale).admin.files
  if (entry.pending !== null) {
    const moving = entry.pending.action === "publish" ? t.movingToPublic : t.movingToPrivate
    if (!entry.pending.failed) return <Badge tone="accent">{moving}</Badge>
    return (
      <Badge tone="danger">
        {t.failed}
        {/* The store's own words, untranslated: a message nobody wrote cannot be. */}
        {entry.pending.lastError !== null && (
          <span className="ml-1 text-ink-muted">{entry.pending.lastError}</span>
        )}
      </Badge>
    )
  }
  return <Badge tone={entry.isPublic ? "brand" : "muted"}>{entry.isPublic ? t.isPublic : t.isPrivate}</Badge>
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
 * bytes. Anything larger than the threshold is cut into parts, and only the
 * parts are signed — beginning and completing need credentials this page does
 * not have.
 *
 * There is no resume. Closing the page abandons whatever is in flight, and the
 * file is sent again from the beginning under the same name, which overwrites.
 *
 * **The chooser stays a plain input rather than `FileField`.** What sends the
 * bytes is this component, not a form submission, so there is nothing for
 * `FileField`'s uncontrolled shape to attach to — the change handler has to run
 * on selection, and the sending state has to disable the input while it runs.
 */
export function UploadPanel({ locale, endpoint, threshold, partSize }: {
  locale: Locale
  /** Where the signatures are asked for. The box is whatever answers there. */
  endpoint: string
  threshold: number
  partSize: number
}) {
  const t = messagesFor(locale).admin.files
  const [progress, setProgress] = useState<UploadProgress[]>([])
  const [done, setDone] = useState(false)
  const [badName, setBadName] = useState(false)
  const aborter = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const send = async (files: File[]) => {
    setDone(false)
    setBadName(files.some((file) => !isUploadableName(file.name)))
    const sendable = files.filter((file) => isUploadableName(file.name))
    if (sendable.length === 0) return

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
    if (input.current !== null) input.current.value = ""
    // The listing is read on the server, so what was just sent appears by
    // asking for the page again rather than by patching the table.
    window.location.reload()
  }

  const busy = progress.length > 0

  return (
    <div className="rounded border border-line px-4 py-3">
      <Stack gap="normal">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input
            ref={input}
            type="file"
            multiple
            disabled={busy}
            onChange={(event) => { void send([...event.target.files ?? []]) }}
            aria-label={t.upload}
            className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-brand file:bg-white file:px-3 file:py-1 file:text-brand file:text-sm"
          />
          {busy && (
            <Button type="button" variant="ghost" onClick={() => { aborter.current?.abort() }}>
              {t.uploadCancel}
            </Button>
          )}
        </div>
        <p className="text-ink-muted text-xs">{t.uploadHint}</p>
        {badName && <Note kind="danger">{t.uploadBadName}</Note>}
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
  = | { kind: "single", name: string, size: number, contentType: string }
    | { kind: "begin", name: string, size: number, contentType: string, partCount: number }
    | { kind: "complete", name: string, uploadId: string, parts: UploadedPart[] }
    | { kind: "abort", name: string, uploadId: string }

interface UploadAnswer {
  kind: string
  url?: string
  uploadId?: string
  urls?: string[]
}

async function ask(
  endpoint: string,
  body: UploadAsk,
  signal: AbortSignal | undefined,
): Promise<{ kind: "single", url: string } | { kind: "begin", uploadId: string, urls: string[] } | { kind: "done" }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`the server refused the upload (${response.status})`)
  const answer = await response.json() as UploadAnswer
  if (answer.kind === "single" && answer.url !== undefined) {
    return { kind: "single", url: answer.url }
  }
  if (answer.kind === "begin" && answer.uploadId !== undefined && answer.urls !== undefined) {
    return { kind: "begin", uploadId: answer.uploadId, urls: answer.urls }
  }
  return { kind: "done" }
}

/**
 * Choosing which of the research's files a dataset points at.
 *
 * **The selection is ordered**, so what is chosen is listed in that order and
 * moved by hand; the picker is a second list because a box can hold ten
 * thousand names, and a filter over one long list of checkboxes could not be
 * put in an order at all.
 *
 * What is offered is the merged listing — at draft time nothing is public yet,
 * and offering only the public side would leave a curator nothing to choose.
 */
export function FileSelection({ locale, listing, selected, onChange }: {
  locale: Locale
  /** Null when the store did not answer, which offers nothing rather than nothing existing. */
  listing: readonly BoxEntry[] | null
  selected: readonly string[]
  onChange: (selection: string[]) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const files = messagesFor(locale).admin.files
  const [filter, setFilter] = useState("")

  if (listing === null) return <p className="text-ink-muted text-sm">{t.filesUnavailable}</p>

  const held = new Set(selected)
  const offered = listing.filter((entry) =>
    !held.has(entry.name) && entry.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const known = new Map(listing.map((entry) => [entry.name, entry]))

  const move = (at: number, by: number) => {
    const next = [...selected]
    const other = at + by
    const here = next[at]
    const there = next[other]
    if (here === undefined || there === undefined) return
    next[at] = there
    next[other] = here
    onChange(next)
  }

  return (
    <Stack gap="normal">
      <p className="text-ink-muted text-xs">{t.filesHint}</p>

      {selected.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm">
          {selected.map((name, at) => {
            const entry = known.get(name)
            return (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <span className="break-all">{name}</span>
                {entry !== undefined && (
                  <span className="text-ink-muted text-xs">{formatSize(entry.size)}</span>
                )}
                <Badge tone={entry?.isPublic === true ? "brand" : "muted"}>
                  {entry?.isPublic === true ? files.isPublic : files.isPrivate}
                </Badge>
                <IconButton
                  name="chevron-up"
                  label={files.moveUp}
                  disabled={at === 0}
                  onClick={() => { move(at, -1) }}
                />
                <IconButton
                  name="chevron-down"
                  label={files.moveDown}
                  disabled={at === selected.length - 1}
                  onClick={() => { move(at, 1) }}
                />
                <IconButton
                  name="close"
                  label={t.removeFile}
                  onClick={() => { onChange(selected.filter((held) => held !== name)) }}
                />
              </li>
            )
          })}
        </ol>
      )}

      {listing.length === 0
        ? <p className="text-ink-muted text-sm">{t.filesEmpty}</p>
        : (
            <Fold summary={t.addFile}>
              <Stack gap="normal">
                {/*
                  A plain, controlled input rather than `Field`: `Field` only ever
                  posts a `defaultValue`, and this one has to filter the picker on
                  every keystroke. `CONTROL` is the edge `Field` itself draws with
                  (form.tsx の CONTROL), taken directly for the same reason the
                  search box in the refinement panel does.
                */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink-muted text-xs">{t.filterFiles}</span>
                  <input
                    type="search"
                    value={filter}
                    onChange={(event) => { setFilter(event.target.value) }}
                    className={`${CONTROL} w-64`}
                  />
                </label>
                <p className="text-ink-muted text-xs">{t.shownOf(offered.length, listing.length)}</p>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                  {offered.map((entry) => (
                    <li key={entry.name} className="flex flex-wrap items-center gap-2">
                      <IconButton
                        name="plus"
                        label={t.addFile}
                        onClick={() => { onChange([...selected, entry.name]) }}
                      />
                      <span className="break-all">{entry.name}</span>
                      <span className="text-ink-muted text-xs">{formatSize(entry.size)}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Fold>
          )}
    </Stack>
  )
}
