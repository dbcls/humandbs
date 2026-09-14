import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { assistantJson, assistantRequest } from "./admin-assistant-api-client"
import {
  decodeTask,
  decodeTaskDetail,
  field,
  record,
} from "./admin-assistant-decoders"
import type { Task, TaskDetail } from "./admin-assistant-model"

export class LatestDetailRequests {
  private selectedTaskId: string | null = null
  private readonly generations = new Map<string, number>()

  selected(): string | null {
    return this.selectedTaskId
  }

  async run<T>(
    taskId: string,
    select: boolean,
    request: () => Promise<T>,
  ): Promise<T | undefined> {
    if (select) this.selectedTaskId = taskId
    const generation = (this.generations.get(taskId) ?? 0) + 1
    this.generations.set(taskId, generation)
    const result = await request()
    return this.selectedTaskId === taskId
      && this.generations.get(taskId) === generation
      ? result
      : undefined
  }
}

export function useAssistantController(locale: Locale) {
  const words = messagesFor(locale).admin.assistant
  const [application, setApplication] = useState<File | null>(null)
  const [ethics, setEthics] = useState<File | null>(null)
  const [plan, setPlan] = useState<File | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<TaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pollingFailed, setPollingFailed] = useState(false)
  const detailRequests = useRef(new LatestDetailRequests())
  const pollingFailedTaskId = useRef<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean, text: string } | null>(
    null,
  )

  const loadDetail = useCallback(async (taskId: string, select = false) => {
    if (select) {
      pollingFailedTaskId.current = null
      setPollingFailed(false)
      setSelected((current) => current?.task_id === taskId ? current : null)
    }
    const detail = await detailRequests.current.run(taskId, select, async () => {
      const parsed = decodeTaskDetail(
        await assistantJson(
          `applications/${encodeURIComponent(taskId)}`,
          words.loadFailed,
        ),
        taskId,
      )
      if (parsed === undefined) throw new Error(words.loadFailed)
      return parsed
    })
    if (detail === undefined) return
    setSelected(detail)
    setTasks((previous) =>
      previous.map((task) =>
        task.task_id === taskId ? { ...task, ...detail } : task,
      ),
    )
  }, [words.loadFailed])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const body = record(
        await assistantJson("applications", words.loadFailed),
      )
      const next = Array.isArray(body?.tasks)
        ? body.tasks.flatMap((value) => {
            const parsed = decodeTask(value)
            return parsed === undefined ? [] : [parsed]
          })
        : []
      setTasks(next)
      if (detailRequests.current.selected() === null && next[0] !== undefined)
        await loadDetail(next[0].task_id, true)
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.loadFailed,
      })
    } finally {
      setLoading(false)
    }
  }, [loadDetail, words.loadFailed])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTasks()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [loadTasks])

  useEffect(() => {
    if (
      pollingFailed
      || pollingFailedTaskId.current === selected?.task_id
      || (selected?.status !== "processing" && selected?.status !== "pending")
    )
      return
    const timer = window.setInterval(() => {
      void loadDetail(selected.task_id).catch((error: unknown) => {
        pollingFailedTaskId.current = selected.task_id
        window.clearInterval(timer)
        setPollingFailed(true)
        setNotice({
          ok: false,
          text: error instanceof Error ? error.message : words.loadFailed,
        })
      })
    }, 5000)
    return () => {
      window.clearInterval(timer)
    }
  }, [loadDetail, pollingFailed, selected?.task_id, selected?.status, words.loadFailed])

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
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
      const body = record(
        await assistantJson("applications", words.uploadFailed, {
          method: "POST",
          body: form,
        }),
      )
      const taskId = body === undefined ? undefined : field(body, "task_id")
      if (taskId === undefined) throw new Error(words.uploadFailed)
      formElement.reset()
      setApplication(null)
      setEthics(null)
      setPlan(null)
      await loadTasks()
      await loadDetail(taskId, true)
      setNotice({ ok: true, text: words.queued(taskId) })
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.uploadFailed,
      })
    } finally {
      setBusy(false)
    }
  }

  const reanalyze = async () => {
    const taskId = detailRequests.current.selected()
    if (selected?.task_id !== taskId) return
    setBusy(true)
    setNotice(null)
    try {
      await assistantRequest(
        `applications/${encodeURIComponent(taskId)}/reanalyze`,
        words.reanalyzeFailed,
        { method: "POST" },
      )
      await loadDetail(taskId)
      await loadTasks()
      setNotice({ ok: true, text: words.reanalyzing })
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.reanalyzeFailed,
      })
    } finally {
      setBusy(false)
    }
  }

  const addDatasets = async (ids: string[]) => {
    const taskId = detailRequests.current.selected()
    if (selected?.task_id !== taskId) return false
    setBusy(true)
    setNotice(null)
    try {
      const result = record(
        await assistantJson(
          `applications/${encodeURIComponent(taskId)}/add-datasets`,
          words.addDatasetsFailed,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset_ids: ids }),
          },
        ),
      )
      const addedCount
        = typeof result?.added_count === "number" ? result.added_count : ids.length
      await loadDetail(taskId)
      setNotice({ ok: true, text: words.datasetsAdded(addedCount) })
      return true
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.addDatasetsFailed,
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  const removeDataset = async (datasetId: string) => {
    const taskId = detailRequests.current.selected()
    if (selected?.task_id !== taskId) return
    setBusy(true)
    setNotice(null)
    try {
      await assistantRequest(
        `applications/${encodeURIComponent(taskId)}/remove-dataset`,
        words.removeDatasetFailed,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataset_id: datasetId }),
        },
      )
      await loadDetail(taskId)
      setNotice({ ok: true, text: words.datasetRemoved(datasetId) })
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.removeDatasetFailed,
      })
    } finally {
      setBusy(false)
    }
  }

  const selectTask = (taskId: string) => {
    void loadDetail(taskId, true).catch((error: unknown) => {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : words.loadFailed,
      })
    })
  }

  return {
    words,
    application,
    ethics,
    plan,
    tasks,
    selected,
    busy,
    loading,
    notice,
    setApplication,
    setEthics,
    setPlan,
    loadTasks,
    selectTask,
    submit,
    reanalyze,
    addDatasets,
    removeDataset,
  }
}
