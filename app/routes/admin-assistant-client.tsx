import { useEffect, useState, type FormEvent } from "react"

import { assistantApiPath } from "~/admin/urls"
import { Button, ButtonLink, Fold, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { Card, Empty, KeyValue, Pairs, Section, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

type Status = "processing" | "completed" | "error" | "pending"

interface Task {
  task_id: string
  status: Status
  created_at?: string
  updated_at?: string
  application_type?: string
}

interface TaskDetail extends Task {
  filename?: string
  assessment?: string
  error?: string
  message?: string
}

function errorMessage(response: Response, fallback: string): Promise<string> {
  return response.json()
    .then((body: { detail?: unknown }) => typeof body.detail === "string" ? body.detail : fallback)
    .catch(() => fallback)
}

function formatTime(value: string | undefined, locale: Locale): string {
  if (value === undefined) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "ja" ? "ja-JP" : "en-GB")
}

function statusClass(status: Status): string {
  if (status === "completed") return "text-ink-muted"
  if (status === "error") return "text-danger"
  if (status === "pending") return "text-warning"
  return "text-brand"
}

export function AssistantWorkspace({ locale }: { locale: Locale }) {
  const words = messagesFor(locale).admin.assistant
  const [application, setApplication] = useState<File | null>(null)
  const [ethics, setEthics] = useState<File | null>(null)
  const [plan, setPlan] = useState<File | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<TaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ ok: boolean, text: string } | null>(null)

  const loadDetail = async (taskId: string) => {
    const response = await fetch(assistantApiPath(`applications/${encodeURIComponent(taskId)}`))
    if (!response.ok) throw new Error(await errorMessage(response, words.loadFailed))
    const detail = await response.json() as TaskDetail
    setSelected({ ...detail, task_id: detail.task_id ?? taskId })
    setTasks((previous) => previous.map((task) => task.task_id === taskId ? { ...task, ...detail } : task))
  }

  const loadTasks = async () => {
    setLoading(true)
    try {
      const response = await fetch(assistantApiPath("applications"))
      if (!response.ok) throw new Error(await errorMessage(response, words.loadFailed))
      const body = await response.json() as { tasks?: Task[] }
      const next = body.tasks ?? []
      setTasks(next)
      if (selected === null && next[0] !== undefined) await loadDetail(next[0].task_id)
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : words.loadFailed })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadTasks() }, [])

  useEffect(() => {
    if (selected?.status !== "processing" && selected?.status !== "pending") return
    const timer = window.setInterval(() => { void loadDetail(selected.task_id).catch(() => {}) }, 5000)
    return () => { window.clearInterval(timer) }
  }, [selected?.task_id, selected?.status])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (application === null) {
      setNotice({ ok: false, text: words.applicationRequired })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const form = new FormData()
      form.set("application_file", application)
      if (ethics !== null) form.set("ethics_file", ethics)
      if (plan !== null) form.set("research_plan_file", plan)
      const response = await fetch(assistantApiPath("applications"), { method: "POST", body: form })
      if (!response.ok) throw new Error(await errorMessage(response, words.uploadFailed))
      const body = await response.json() as { task_id?: string }
      if (body.task_id === undefined) throw new Error(words.uploadFailed)
      setApplication(null)
      setEthics(null)
      setPlan(null)
      await loadTasks()
      await loadDetail(body.task_id)
      setNotice({ ok: true, text: words.queued(body.task_id) })
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : words.uploadFailed })
    } finally {
      setBusy(false)
    }
  }

  const reanalyze = async () => {
    if (selected === null) return
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch(assistantApiPath(`applications/${encodeURIComponent(selected.task_id)}/reanalyze`), { method: "POST" })
      if (!response.ok) throw new Error(await errorMessage(response, words.reanalyzeFailed))
      await loadDetail(selected.task_id)
      await loadTasks()
      setNotice({ ok: true, text: words.reanalyzing })
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : words.reanalyzeFailed })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="block">
      {notice !== null && <Note kind={notice.ok ? "done" : "danger"} live>{notice.text}</Note>}
      <Card under={false}>
        <form onSubmit={submit}>
          <Stack>
            <Section title={words.uploadHeading}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FileInput label={words.applicationFile} required file={application} disabled={busy} onChange={setApplication} />
                <FileInput label={words.ethicsFile} file={ethics} disabled={busy} onChange={setEthics} />
                <FileInput label={words.planFile} file={plan} disabled={busy} onChange={setPlan} />
              </div>
            </Section>
            <div><Button variant="primary" disabled={busy} icon={<Icon name={busy ? "spinner" : "upload"} className={busy ? "animate-spin" : ""} />}>{busy ? words.uploading : words.upload}</Button></div>
          </Stack>
        </form>
      </Card>
      <Card under={false}>
        <Stack>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand text-lg">{words.listHeading}</h2>
            <Button type="button" icon={<Icon name="undo" />} disabled={loading} onClick={() => { void loadTasks() }}>{words.refresh}</Button>
          </div>
          {loading && tasks.length === 0 ? <Empty>{words.loading}</Empty> : tasks.length === 0 ? <Empty>{words.none}</Empty> : (
            <Table headers={[words.taskId, words.applicationType, words.status, words.updated]}>
              {tasks.map((task) => <tr key={task.task_id} className={selected?.task_id === task.task_id ? "bg-surface-hover" : ""}>
                <Td nowrap><button type="button" onClick={() => { void loadDetail(task.task_id).catch((error: unknown) => setNotice({ ok: false, text: error instanceof Error ? error.message : words.loadFailed })) }} className="cursor-pointer text-left font-mono text-brand underline">{task.task_id}</button></Td>
                <Td>{task.application_type ?? "-"}</Td>
                <Td><span className={statusClass(task.status)}>{words.statuses[task.status]}</span></Td>
                <Td>{formatTime(task.updated_at ?? task.created_at, locale)}</Td>
              </tr>)}
            </Table>
          )}
        </Stack>
      </Card>
      {selected !== null && <TaskDetailView detail={selected} locale={locale} busy={busy} onReanalyze={reanalyze} />}
    </Stack>
  )
}

function FileInput({ label, required = false, file, disabled, onChange }: { label: string, required?: boolean, file: File | null, disabled: boolean, onChange: (file: File | null) => void }) {
  return <label className="flex flex-col gap-2 text-sm"><span className="font-semibold text-ink-muted text-xs">{label}</span><input type="file" accept="application/pdf" required={required} disabled={disabled} onChange={(event) => onChange(event.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-brand file:bg-white file:px-3 file:py-1 file:text-brand" />{file !== null && <span className="truncate text-ink-muted text-xs">{file.name}</span>}</label>
}

function TaskDetailView({ detail, locale, busy, onReanalyze }: { detail: TaskDetail, locale: Locale, busy: boolean, onReanalyze: () => void }) {
  const words = messagesFor(locale).admin.assistant
  const pdf = detail.filename === undefined ? null : assistantApiPath(`uploads/${encodeURIComponent(detail.filename)}`)
  const handout = assistantApiPath(`applications/${encodeURIComponent(detail.task_id)}/handout`)
  const word = assistantApiPath(`applications/${encodeURIComponent(detail.task_id)}/handout/word`)
  return <Card under={false}><Stack>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-brand text-lg">{words.detailHeading(detail.task_id)}</h2><span className={`${statusClass(detail.status)} text-sm`}>{words.statuses[detail.status]}</span></div>
    <Pairs><KeyValue title={words.created}>{formatTime(detail.created_at, locale)}</KeyValue><KeyValue title={words.updated}>{formatTime(detail.updated_at, locale)}</KeyValue></Pairs>
    {detail.message !== undefined && <Note>{detail.message}</Note>}
    {detail.error !== undefined && <Note kind="danger">{detail.error}</Note>}
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || detail.status === "processing" || detail.status === "pending"} onClick={onReanalyze} icon={<Icon name="undo" />}>{words.reanalyze}</Button>{pdf !== null && <ButtonLink to={pdf} external newTab icon={<Icon name="eye" />}>{words.openPdf}</ButtonLink>}{detail.status === "completed" && <><ButtonLink to={handout} external newTab icon={<Icon name="eye" />}>{words.handout}</ButtonLink><ButtonLink to={word} external icon={<Icon name="download" />}>{words.downloadWord}</ButtonLink></>}</div>
    {detail.assessment !== undefined && <Fold summary={words.assessment}><iframe srcDoc={detail.assessment} sandbox="allow-popups" title={words.assessment} className="h-[75vh] w-full border border-line" /></Fold>}
  </Stack></Card>
}