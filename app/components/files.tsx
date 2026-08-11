import { useRef, useState } from "react"
import { Form } from "react-router"

import { fileUploadPath } from "~/admin/urls"
import {
  formatSize,
  isUploadableName,
  MULTIPART_CONCURRENCY,
  type BoxEntry,
} from "~/files/box"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { filePath } from "~/public/urls"

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
    <>
      <p className="mb-2 text-ink-muted text-sm">{t.fileCount(total)}</p>
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
    </>
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
    <>
      <span>{name}</span>
      <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
        {t.fileNotPublic}
      </span>
      {humLabel !== null && (
        <span className="mt-1 block text-ink-muted text-xs">
          {`${t.fileWillBeAt}: ${filePath(humLabel, name)}`}
        </span>
      )}
    </>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (rows.length === 0) return <Empty>{t.empty}</Empty>

  return (
    <Form method="post">
      <Table headers={["", t.name, t.size, t.updatedAt, t.state]}>
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

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="submit"
          name="intent"
          value="publish"
          className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand"
        >
          {t.publish}
        </button>
        <button
          type="submit"
          name="intent"
          value="unpublish"
          className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand"
        >
          {t.unpublish}
        </button>
        {confirmingDelete
          ? (
              <>
                <span className="text-danger text-xs">{t.deleteWarning}</span>
                <button
                  type="submit"
                  name="intent"
                  value="delete"
                  className="cursor-pointer rounded-sm border border-danger px-3 py-1 text-danger"
                >
                  {t.deleteConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmingDelete(false) }}
                  className="cursor-pointer text-ink-muted text-xs underline"
                >
                  {t.cancel}
                </button>
              </>
            )
          : (
              <button
                type="button"
                onClick={() => { setConfirmingDelete(true) }}
                className="cursor-pointer text-ink-muted text-xs underline"
              >
                {t.delete}
              </button>
            )}
      </div>
    </Form>
  )
}

function State({ locale, entry }: { locale: Locale, entry: BoxEntry }) {
  const t = messagesFor(locale).admin.files
  if (entry.pending !== null) {
    const moving = entry.pending.action === "publish" ? t.movingToPublic : t.movingToPrivate
    if (!entry.pending.failed) return <span className="text-accent text-xs">{moving}</span>
    return (
      <span className="text-danger text-xs">
        {t.failed}
        {/* The store's own words, untranslated: a message nobody wrote cannot be. */}
        {entry.pending.lastError !== null && (
          <span className="ml-1 text-ink-muted">{entry.pending.lastError}</span>
        )}
      </span>
    )
  }
  return (
    <span className={entry.isPublic ? "text-brand text-xs" : "text-ink-muted text-xs"}>
      {entry.isPublic ? t.isPublic : t.isPrivate}
    </span>
  )
}

interface Progress {
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
 */
export function UploadPanel({ locale, researchId, threshold, partSize }: {
  locale: Locale
  researchId: string
  threshold: number
  partSize: number
}) {
  const t = messagesFor(locale).admin.files
  const [progress, setProgress] = useState<Progress[]>([])
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
        await sendOne(researchId, file, { threshold, partSize }, at, controller.signal)
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
    <div className="rounded-sm border border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          ref={input}
          type="file"
          multiple
          disabled={busy}
          onChange={(event) => { void send([...event.target.files ?? []]) }}
          aria-label={t.upload}
        />
        {busy && (
          <button
            type="button"
            onClick={() => { aborter.current?.abort() }}
            className="cursor-pointer text-ink-muted text-xs underline"
          >
            {t.uploadCancel}
          </button>
        )}
      </div>
      <p className="mt-2 text-ink-muted text-xs">{t.uploadHint}</p>
      {badName && <p className="mt-2 text-danger text-xs">{t.uploadBadName}</p>}
      {done && <p className="mt-2 text-brand text-xs">{t.uploadDone}</p>}
      {progress.map((row) => (
        <p key={row.name} className={row.failed ? "mt-2 text-danger text-xs" : "mt-2 text-xs"}>
          {row.failed ? t.uploadFailed(row.name) : t.uploading(row.name, row.percent)}
        </p>
      ))}
    </div>
  )
}

interface UploadShape {
  threshold: number
  partSize: number
}

async function sendOne(
  researchId: string,
  file: File,
  shape: UploadShape,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const contentType = file.type === "" ? "application/octet-stream" : file.type

  if (file.size <= shape.threshold) {
    const answer = await ask(researchId, {
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
  const begun = await ask(researchId, {
    kind: "begin",
    name: file.name,
    size: file.size,
    contentType,
    partCount,
  }, signal)
  if (begun.kind !== "begin") throw new Error("the server answered with the wrong shape")

  try {
    const parts = await sendParts(file, shape.partSize, begun.urls, onProgress, signal)
    await ask(researchId, {
      kind: "complete",
      name: file.name,
      uploadId: begun.uploadId,
      parts,
    }, signal)
    onProgress(100)
  } catch (error) {
    // The store keeps the parts of an upload nobody finished, so an abandoned
    // one is told to forget them rather than left to be found later.
    await ask(researchId, {
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
  const parts: UploadedPart[] = []
  const sentOf = new Map<number, number>()
  let next = 0

  const report = () => {
    const sent = [...sentOf.values()].reduce((total, value) => total + value, 0)
    onProgress(Math.min(99, Math.floor((sent / file.size) * 100)))
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      const url = urls[index]
      if (url === undefined) return
      const from = index * partSize
      const blob = file.slice(from, Math.min(from + partSize, file.size))
      const etag = await put(url, blob, "", (percent) => {
        sentOf.set(index, (blob.size * percent) / 100)
        report()
      }, signal)
      sentOf.set(index, blob.size)
      report()
      if (etag === null) throw new Error("the store returned no ETag for a part")
      parts.push({ partNumber: index + 1, etag })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MULTIPART_CONCURRENCY, urls.length) }, worker),
  )
  return parts
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
  researchId: string,
  body: UploadAsk,
  signal: AbortSignal | undefined,
): Promise<{ kind: "single", url: string } | { kind: "begin", uploadId: string, urls: string[] } | { kind: "done" }> {
  const response = await fetch(fileUploadPath(researchId), {
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
  const [picking, setPicking] = useState(false)
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
    <div className="mt-2">
      <p className="text-ink-muted text-xs">{t.filesHint}</p>
      {selected.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {selected.map((name, at) => {
            const entry = known.get(name)
            return (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <span className="break-all">{name}</span>
                {entry !== undefined && (
                  <span className="text-ink-muted text-xs">{formatSize(entry.size)}</span>
                )}
                <span className={entry?.isPublic === true ? "text-brand text-xs" : "text-ink-muted text-xs"}>
                  {entry?.isPublic === true ? files.isPublic : files.isPrivate}
                </span>
                <button
                  type="button"
                  disabled={at === 0}
                  onClick={() => { move(at, -1) }}
                  className="cursor-pointer text-ink-muted text-xs underline disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={at === selected.length - 1}
                  onClick={() => { move(at, 1) }}
                  className="cursor-pointer text-ink-muted text-xs underline disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => { onChange(selected.filter((held) => held !== name)) }}
                  className="cursor-pointer text-ink-muted text-xs underline"
                >
                  {t.removeFile}
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {listing.length === 0
        ? <p className="mt-2 text-ink-muted text-sm">{t.filesEmpty}</p>
        : !picking
            ? (
                <button
                  type="button"
                  onClick={() => { setPicking(true) }}
                  className="mt-2 cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-xs"
                >
                  {t.addFile}
                </button>
              )
            : (
                <div className="mt-2 rounded-sm border border-line px-3 py-2">
                  <input
                    type="search"
                    value={filter}
                    placeholder={t.filterFiles}
                    onChange={(event) => { setFilter(event.target.value) }}
                    className="rounded-sm border border-line px-2 py-1 text-sm"
                    aria-label={t.filterFiles}
                  />
                  <span className="ml-2 text-ink-muted text-xs">
                    {t.shownOf(offered.length, listing.length)}
                  </span>
                  <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                    {offered.map((entry) => (
                      <li key={entry.name} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { onChange([...selected, entry.name]) }}
                          className="cursor-pointer text-brand text-xs underline"
                        >
                          +
                        </button>
                        <span className="break-all">{entry.name}</span>
                        <span className="text-ink-muted text-xs">{formatSize(entry.size)}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => { setPicking(false) }}
                    className="mt-2 cursor-pointer text-ink-muted text-xs underline"
                  >
                    {messagesFor(locale).admin.files.cancel}
                  </button>
                </div>
              )}
    </div>
  )
}
