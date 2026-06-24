import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  ExternalLink,
  FileText,
  RefreshCcw,
  RefreshCw,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Card } from "@/components/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  $addAssistantDatasets,
  $batchReanalyzeAssistantApplications,
  $getAssistantApplication,
  $listAssistantApplications,
  $reanalyzeAssistantApplication,
  $removeAssistantDataset,
  $uploadAssistantAttachments,
  type AssistantTaskDetails,
  type AssistantTaskStatus,
  type AssistantApplicationTask,
} from "@/serverFunctions/assistant";

import { AssistantNotice } from "./assistant-ui";

type SortField = "task_id" | "status" | "created_at" | "updated_at" | "application_type";
type SortOrder = "asc" | "desc";
type ApplicationType = "提供申請" | "利用申請";

interface AssistantTaskStatusProps {
  currentTaskId: string | null;
  pollingInterval?: number;
  publicApiBaseUrl: string;
  showBatchReanalysisButton: boolean;
  showResearcherHistory: boolean;
}

interface AssistantPdfPreviewProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
}

interface AssistantPdfPreviewRef {
  scrollToPage: (pageNumber: number) => void;
  scrollToPixel: (x: number, y: number) => void;
}

const AssistantPdfPreview = forwardRef<AssistantPdfPreviewRef, AssistantPdfPreviewProps>(
  ({ fileUrl, fileName, className = "" }, ref) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToPage: (pageNumber: number) => {
        const baseUrl = fileUrl.split("#")[0];
        reloadIframe(`${baseUrl}#page=${pageNumber}`);
      },
      scrollToPixel: (x: number, y: number) => {
        const baseUrl = fileUrl.split("#")[0];
        reloadIframe(`${baseUrl}#page=1&zoom=100,${x},${y}`);
      },
    }));

    const reloadIframe = (newSrc: string) => {
      if (!iframeRef.current) {
        return;
      }

      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = newSrc;
        }
      }, 100);
    };

    return (
      <Card className={`h-full w-full ${className}`} containerClassName="h-full">
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-medium">{fileName || "申請書PDF"}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, "_blank")}>
              <ExternalLink className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">新しいタブ</span>
            </Button>
          </div>

          <div className="relative flex-1 overflow-hidden rounded-lg border bg-slate-100">
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
                <div className="text-center">
                  <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-blue-500 border-b-2" />
                  <div className="text-slate-500 text-sm">PDFを読み込み中...</div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            ) : null}

            <iframe
              ref={iframeRef}
              src={fileUrl}
              width="100%"
              height="100%"
              onLoad={() => {
                setLoading(false);
                setError(null);
              }}
              onError={() => {
                setError("PDFファイルの読み込みに失敗しました");
                setLoading(false);
              }}
              className="h-[calc(100vh-16rem)] min-h-[400px] border-0"
              title={fileName || "申請書PDF"}
            />
          </div>
        </div>
      </Card>
    );
  },
);

AssistantPdfPreview.displayName = "AssistantPdfPreview";

function normalizeStatus(status?: string | null): AssistantTaskStatus {
  if (status === "processing" || status === "completed" || status === "pending" || status === "failed") {
    return status;
  }
  return "error";
}

function parseDatasetIdsInput(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function formatDate(dateString?: string | null) {
  if (!dateString) {
    return "-";
  }
  return new Date(dateString).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusWeight(status: AssistantTaskStatus): number {
  switch (status) {
    case "completed":
      return 4;
    case "failed":
      return 3;
    case "processing":
      return 2;
    case "pending":
      return 1;
    default:
      return 0;
  }
}

function getStatusBadge(status: AssistantTaskStatus) {
  switch (status) {
    case "pending":
      return <Badge className="border-yellow-200 bg-yellow-50 text-yellow-700">待機中</Badge>;
    case "processing":
      return <Badge className="border-blue-200 bg-blue-50 text-blue-700">処理中</Badge>;
    case "completed":
      return <Badge className="border-green-200 bg-green-50 text-green-700">完了</Badge>;
    case "failed":
    case "error":
      return <Badge className="border-red-200 bg-red-50 text-red-700">失敗</Badge>;
  }
}

function getStatusIcon(status: AssistantTaskStatus) {
  switch (status) {
    case "pending":
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case "processing":
      return <Clock className="h-5 w-5 animate-pulse text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "failed":
    case "error":
      return <AlertCircle className="h-5 w-5 text-red-500" />;
  }
}

function parseTaskDetails(raw: AssistantTaskDetails, fallbackTaskId: string): AssistantTaskDetails {
  return {
    ...raw,
    id: String((raw.task_id as string) ?? (raw.id as string) ?? fallbackTaskId),
    task_id: String((raw.task_id as string) ?? (raw.id as string) ?? fallbackTaskId),
    status: normalizeStatus(raw.status as string | null | undefined),
    created_at: (raw.created_at as string | null | undefined) ?? new Date().toISOString(),
  };
}

function toTaskSummary(task: AssistantApplicationTask): AssistantApplicationTask {
  return {
    ...task,
    task_id: String(task.task_id),
    status: normalizeStatus(task.status),
    created_at: task.created_at ?? new Date().toISOString(),
    application_type: task.application_type ?? "利用申請",
  };
}

export function AssistantTaskStatusPanel({
  currentTaskId,
  pollingInterval = 5000,
  publicApiBaseUrl,
  showBatchReanalysisButton,
  showResearcherHistory,
}: AssistantTaskStatusProps) {
  const [taskId, setTaskId] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("assistantSelectedTaskId") ?? "";
  });
  const [tasks, setTasks] = useState<AssistantApplicationTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [taskDetails, setTaskDetails] = useState<AssistantTaskDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("task_id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [applicationTypeFilter, setApplicationTypeFilter] = useState<ApplicationType | "all">("all");
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [batchReanalyzing, setBatchReanalyzing] = useState(false);
  const [showAttachmentUploader, setShowAttachmentUploader] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [ethicsUploadFile, setEthicsUploadFile] = useState<File | null>(null);
  const [researchPlanUploadFile, setResearchPlanUploadFile] = useState<File | null>(null);
  const [datasetIdsInput, setDatasetIdsInput] = useState("");
  const [datasetActionLoading, setDatasetActionLoading] = useState(false);
  const [datasetMessage, setDatasetMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const pdfPreviewRef = useRef<AssistantPdfPreviewRef>(null);

  const sectionPositionMap: Record<string, number> = {
    研究代表者: 250,
    申請者: 420,
    所属機関の長: 580,
  };

  const setAndSaveTaskId = (id: string) => {
    setTaskId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("assistantSelectedTaskId", id);
    }
  };

  const fetchTaskDetails = async (id: string) => {
    if (!id) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const details = await $getAssistantApplication({ data: { taskId: id } });
      const parsed = parseTaskDetails(details, id);
      setTaskDetails(parsed);
      setAndSaveTaskId(parsed.task_id as string);

      setTasks((prev) =>
        prev.map((task) =>
          task.task_id === parsed.task_id
            ? {
                ...task,
                status: normalizeStatus(parsed.status as string),
                updated_at: (parsed.updated_at as string | undefined) ?? task.updated_at,
                filename: (parsed.filename as string | undefined) ?? task.filename,
              }
            : task,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    setLoadingTasks(true);
    setError(null);

    try {
      const response = await $listAssistantApplications();
      const list = (response.tasks ?? []).map(toTaskSummary);
      setTasks(list);

      if (!taskId && list.length > 0) {
        await fetchTaskDetails(list[0].task_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請ID一覧の取得に失敗しました");
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    void fetchTasks();
  }, []);

  useEffect(() => {
    if (currentTaskId) {
      void fetchTaskDetails(currentTaskId);
    }
  }, [currentTaskId]);

  useEffect(() => {
    const shouldPoll =
      !!taskId &&
      !!taskDetails &&
      (taskDetails.status === "pending" || taskDetails.status === "processing");

    setPollingActive(shouldPoll);
    if (!shouldPoll) {
      return;
    }

    const intervalId = setInterval(() => {
      void fetchTaskDetails(taskId);
    }, pollingInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [pollingInterval, taskDetails, taskId]);

  const sortedTasks = useMemo(() => {
    const filtered =
      applicationTypeFilter === "all"
        ? [...tasks]
        : tasks.filter(
            (task) => (task.application_type ?? "利用申請") === applicationTypeFilter,
          );

    return filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "task_id":
          comparison = a.task_id.localeCompare(b.task_id);
          break;
        case "status":
          comparison =
            getStatusWeight(normalizeStatus(a.status)) - getStatusWeight(normalizeStatus(b.status));
          break;
        case "created_at":
          comparison = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
          break;
        case "updated_at": {
          const aTime = new Date((a.updated_at ?? a.created_at) ?? 0).getTime();
          const bTime = new Date((b.updated_at ?? b.created_at) ?? 0).getTime();
          comparison = aTime - bTime;
          break;
        }
        case "application_type":
          comparison = (a.application_type ?? "利用申請").localeCompare(
            b.application_type ?? "利用申請",
          );
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [applicationTypeFilter, sortField, sortOrder, tasks]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const handleSectionClick = (sectionName: string) => {
    const y = sectionPositionMap[sectionName];
    if (Number.isFinite(y)) {
      pdfPreviewRef.current?.scrollToPixel(0, y);
    }
  };

  const addClickHandlersToAssessmentHtml = (html: string) => {
    let modifiedHtml = html;
    for (const section of Object.keys(sectionPositionMap)) {
      const regex = new RegExp(`<h([1-6])([^>]*)>([^<]*${section}[^<]*)</h([1-6])>`, "gi");
      modifiedHtml = modifiedHtml.replace(
        regex,
        `<h$1$2 class=\"cursor-pointer rounded border-l-4 border-transparent p-2 transition-colors hover:border-blue-400 hover:bg-blue-50\" data-section=\"${section}\">$3</h$4>`,
      );
    }
    return modifiedHtml;
  };

  const handleAssessmentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const sectionElement = target.closest("[data-section]") as HTMLElement | null;
    const sectionName = sectionElement?.dataset.section;
    if (sectionName) {
      handleSectionClick(sectionName);
    }
  };

  const handleAttachmentUpload = async () => {
    if (!taskDetails?.task_id) {
      setAttachmentMessage({ type: "error", text: "申請情報が取得できません" });
      return;
    }

    if (!ethicsUploadFile && !researchPlanUploadFile) {
      setAttachmentMessage({ type: "error", text: "アップロードするPDFを選択してください" });
      return;
    }

    setAttachmentUploading(true);
    setAttachmentMessage(null);

    try {
      const formData = new FormData();
      formData.set("taskId", taskDetails.task_id as string);
      if (ethicsUploadFile) {
        formData.set("ethics_file", ethicsUploadFile);
      }
      if (researchPlanUploadFile) {
        formData.set("research_plan_file", researchPlanUploadFile);
      }

      await $uploadAssistantAttachments({ data: formData });
      setAttachmentMessage({ type: "success", text: "添付ファイルを更新しました" });
      setEthicsUploadFile(null);
      setResearchPlanUploadFile(null);
      await fetchTaskDetails(taskDetails.task_id as string);
    } catch (err) {
      setAttachmentMessage({
        type: "error",
        text: err instanceof Error ? err.message : "アップロードに失敗しました",
      });
    } finally {
      setAttachmentUploading(false);
    }
  };

  const reanalyze = async () => {
    if (!taskDetails?.task_id) {
      return;
    }

    setReanalyzing(true);
    setError(null);
    try {
      await $reanalyzeAssistantApplication({ data: { taskId: taskDetails.task_id as string } });
      await fetchTaskDetails(taskDetails.task_id as string);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "再解析の開始に失敗しました");
    } finally {
      setReanalyzing(false);
    }
  };

  const batchReanalyze = async () => {
    if (tasks.length === 0) {
      setError("再解析対象の申請がありません");
      return;
    }

    setBatchReanalyzing(true);
    setError(null);
    try {
      await $batchReanalyzeAssistantApplications();
      await fetchTasks();
      if (taskId) {
        await fetchTaskDetails(taskId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "一括再解析の開始に失敗しました");
    } finally {
      setBatchReanalyzing(false);
    }
  };

  const addDatasets = async () => {
    if (!taskDetails?.task_id) {
      setDatasetMessage({ type: "error", text: "申請情報が取得できません" });
      return;
    }

    const datasetIds = parseDatasetIdsInput(datasetIdsInput);
    if (datasetIds.length === 0) {
      setDatasetMessage({ type: "error", text: "データセットIDを入力してください" });
      return;
    }

    setDatasetActionLoading(true);
    setDatasetMessage(null);

    try {
      const result = (await $addAssistantDatasets({
        data: { taskId: taskDetails.task_id as string, datasetIds },
      })) as {
        added_count?: number;
        status?: string;
        warning_datasets?: string[];
        skipped_datasets?: string[];
      };

      let message = `${result.added_count ?? 0}件のデータセットを追加しました。`;
      let type: "success" | "warning" = "success";

      if (result.status === "warning") {
        type = "warning";
        if (result.warning_datasets?.length) {
          message += ` 処理できないID: ${result.warning_datasets.join(", ")}`;
        }
      }

      if (result.skipped_datasets?.length) {
        message += ` (${result.skipped_datasets.length}件はスキップ)`;
      }

      setDatasetMessage({ type, text: message });
      setDatasetIdsInput("");
      await fetchTaskDetails(taskDetails.task_id as string);
    } catch (err) {
      setDatasetMessage({
        type: "error",
        text: err instanceof Error ? err.message : "データセットの追加に失敗しました",
      });
    } finally {
      setDatasetActionLoading(false);
    }
  };

  const removeDataset = async (datasetId: string) => {
    if (!taskDetails?.task_id) {
      return;
    }

    const confirmed = window.confirm(`データセットID ${datasetId} を削除します。よろしいですか？`);
    if (!confirmed) {
      return;
    }

    setDatasetActionLoading(true);
    setDatasetMessage(null);

    try {
      await $removeAssistantDataset({
        data: { taskId: taskDetails.task_id as string, datasetId },
      });
      setDatasetMessage({ type: "success", text: `データセットID ${datasetId} を削除しました。` });
      await fetchTaskDetails(taskDetails.task_id as string);
    } catch (err) {
      setDatasetMessage({
        type: "error",
        text: err instanceof Error ? err.message : "データセットの削除に失敗しました",
      });
    } finally {
      setDatasetActionLoading(false);
    }
  };

  const datasets = (taskDetails?.datasets as Array<{ dataset_id?: string; id?: string }> | undefined) ?? [];

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">申請一覧</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant={applicationTypeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setApplicationTypeFilter("all")}
              className="h-8 px-3"
            >
              すべて
            </Button>
            <Button
              variant={applicationTypeFilter === "提供申請" ? "default" : "outline"}
              size="sm"
              onClick={() => setApplicationTypeFilter("提供申請")}
              className="h-8 px-3"
            >
              提供申請
            </Button>
            <Button
              variant={applicationTypeFilter === "利用申請" ? "default" : "outline"}
              size="sm"
              onClick={() => setApplicationTypeFilter("利用申請")}
              className="h-8 px-3"
            >
              利用申請
            </Button>
          </div>

          {showBatchReanalysisButton ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void batchReanalyze()}
              disabled={batchReanalyzing || loadingTasks || tasks.length === 0}
              className="h-8 px-2"
            >
              <RefreshCcw className={`h-4 w-4 ${batchReanalyzing ? "animate-spin" : ""}`} />
              <span className="ml-1">{batchReanalyzing ? "一括再解析中..." : "一括再解析"}</span>
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" onClick={() => void fetchTasks()} disabled={loadingTasks}>
            <RefreshCw className={`h-4 w-4 ${loadingTasks ? "animate-spin" : ""}`} />
            <span className="ml-1">更新</span>
          </Button>
        </div>
      </div>

      {loadingTasks && tasks.length === 0 ? (
        <AssistantNotice>申請一覧を読み込み中...</AssistantNotice>
      ) : null}

      {!loadingTasks && tasks.length === 0 ? (
        <AssistantNotice>利用可能な申請IDがありません。申請書PDFをアップロードしてください。</AssistantNotice>
      ) : null}

      {tasks.length > 0 ? (
        <Card className="overflow-hidden" containerClassName="mt-0">
          <div className="h-[250px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th
                    className="cursor-pointer px-4 py-2 text-left text-muted-foreground text-xs"
                    onClick={() => handleSort("task_id")}
                  >
                    <span className="inline-flex items-center gap-1">
                      申請ID
                      {sortField === "task_id" ? (
                        sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : null}
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2 text-left text-muted-foreground text-xs"
                    onClick={() => handleSort("application_type")}
                  >
                    <span className="inline-flex items-center gap-1">
                      申請種別
                      {sortField === "application_type" ? (
                        sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : null}
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2 text-left text-muted-foreground text-xs"
                    onClick={() => handleSort("status")}
                  >
                    <span className="inline-flex items-center gap-1">
                      ステータス
                      {sortField === "status" ? (
                        sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : null}
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2 text-left text-muted-foreground text-xs"
                    onClick={() => handleSort("created_at")}
                  >
                    <span className="inline-flex items-center gap-1">
                      作成日時
                      {sortField === "created_at" ? (
                        sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : null}
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2 text-left text-muted-foreground text-xs"
                    onClick={() => handleSort("updated_at")}
                  >
                    <span className="inline-flex items-center gap-1">
                      更新日時
                      {sortField === "updated_at" ? (
                        sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : null}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((task) => {
                  const status = normalizeStatus(task.status);
                  return (
                    <tr
                      key={task.task_id}
                      className={`cursor-pointer border-b hover:bg-slate-50 ${task.task_id === taskId ? "bg-slate-100" : ""}`}
                      onClick={() => void fetchTaskDetails(task.task_id)}
                    >
                      <td className="px-4 py-2 font-mono text-sm">{task.task_id}</td>
                      <td className="px-4 py-2 text-sm">{task.application_type ?? "利用申請"}</td>
                      <td className="px-4 py-2">{getStatusBadge(status)}</td>
                      <td className="px-4 py-2 text-sm">{formatDate(task.created_at)}</td>
                      <td className="px-4 py-2 text-sm">{formatDate(task.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {batchReanalyzing ? <AssistantNotice>全申請を一括で再解析しています...</AssistantNotice> : null}

      {error ? (
        <AssistantNotice variant="error">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        </AssistantNotice>
      ) : null}

      {loading ? <AssistantNotice>データを読み込み中...</AssistantNotice> : null}

      {taskDetails ? (
        <div className="space-y-4">
          <Card>
            <div className="space-y-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(normalizeStatus(taskDetails.status as string | null | undefined))}
                  <h3 className="text-lg font-medium">申請: {taskDetails.task_id}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {pollingActive ? (
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                      <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                      自動更新中
                    </Badge>
                  ) : null}
                  {getStatusBadge(normalizeStatus(taskDetails.status as string | null | undefined))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <span className="text-slate-700 text-sm">
                  申請書: {taskDetails.filename ? (
                    <a
                      href={`${publicApiBaseUrl.replace(/\/api$/, "")}/uploads/${taskDetails.filename}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-blue-600"
                    >
                      {taskDetails.filename}
                    </a>
                  ) : (
                    "-"
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPDFPreview((prev) => !prev)}
                  className="ml-auto"
                >
                  <Eye className="mr-1 h-4 w-4" />
                  {showPDFPreview ? "プレビューを隠す" : "プレビュー"}
                </Button>
              </div>

              <div className="pl-6">
                <div className="mb-2 font-medium text-sm text-slate-700">添付ファイル:</div>
                <div className="space-y-1 text-sm">
                  {taskDetails.ethics_file_path ? (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-green-500">✓</span>
                      <a
                        href={`${publicApiBaseUrl.replace(/\/api$/, "")}/${taskDetails.ethics_file_path as string}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-blue-600"
                      >
                        研究実施許可書
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">研究実施許可書なし</div>
                  )}

                  {taskDetails.research_plan_path ? (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-green-500">✓</span>
                      <a
                        href={`${publicApiBaseUrl.replace(/\/api$/, "")}/${taskDetails.research_plan_path as string}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-blue-600"
                      >
                        研究計画書
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">研究計画書なし</div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAttachmentUploader((prev) => !prev)}
                  >
                    {showAttachmentUploader ? "閉じる" : "アップロード"}
                  </Button>
                </div>

                {showAttachmentUploader ? (
                  <div className="mt-3 max-w-lg space-y-3 rounded-md border bg-slate-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="assistant-ethics-pdf-reupload">研究実施許可書（PDF）</Label>
                        <Input
                          id="assistant-ethics-pdf-reupload"
                          type="file"
                          accept=".pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (file && file.type !== "application/pdf") {
                              setAttachmentMessage({
                                type: "error",
                                text: "研究実施許可書はPDFファイルを選択してください",
                              });
                              return;
                            }
                            setEthicsUploadFile(file);
                            setAttachmentMessage(null);
                          }}
                          disabled={attachmentUploading}
                          className="cursor-pointer"
                        />
                        {ethicsUploadFile ? (
                          <p className="text-slate-500 text-xs">選択済み: {ethicsUploadFile.name}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="assistant-research-plan-reupload">研究計画書（PDF）</Label>
                        <Input
                          id="assistant-research-plan-reupload"
                          type="file"
                          accept=".pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (file && file.type !== "application/pdf") {
                              setAttachmentMessage({
                                type: "error",
                                text: "研究計画書はPDFファイルを選択してください",
                              });
                              return;
                            }
                            setResearchPlanUploadFile(file);
                            setAttachmentMessage(null);
                          }}
                          disabled={attachmentUploading}
                          className="cursor-pointer"
                        />
                        {researchPlanUploadFile ? (
                          <p className="text-slate-500 text-xs">選択済み: {researchPlanUploadFile.name}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => void handleAttachmentUpload()} disabled={attachmentUploading}>
                        {attachmentUploading ? "アップロード中..." : "アップロード"}
                      </Button>
                      <span className="text-slate-500 text-xs">既存ファイルは上書きされます。</span>
                    </div>

                    {attachmentMessage ? (
                      <AssistantNotice variant={attachmentMessage.type === "error" ? "error" : "success"}>
                        {attachmentMessage.text}
                      </AssistantNotice>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="text-slate-500 text-sm">
                <p>作成日時: {formatDate(taskDetails.created_at as string | null | undefined)}</p>
                <p>更新日時: {formatDate(taskDetails.updated_at as string | null | undefined)}</p>
              </div>

              {taskDetails.status !== "pending" && taskDetails.status !== "processing" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void reanalyze()} disabled={reanalyzing}>
                    <RefreshCcw className={`mr-2 h-4 w-4 ${reanalyzing ? "animate-spin" : ""}`} />
                    {reanalyzing ? "再解析中..." : "再解析を実行"}
                  </Button>

                </div>
              ) : null}

              {taskDetails.message ? <AssistantNotice>{taskDetails.message as string}</AssistantNotice> : null}
              {taskDetails.error ? <AssistantNotice variant="error">{taskDetails.error as string}</AssistantNotice> : null}
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <h4 className="font-medium text-md">データセット追加・削除</h4>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={datasetIdsInput}
                  onChange={(event) => setDatasetIdsInput(event.target.value)}
                  placeholder="データセットIDをカンマまたは空白区切りで入力"
                />
                <Button onClick={() => void addDatasets()} disabled={datasetActionLoading}>
                  追加
                </Button>
              </div>

              {datasetMessage ? (
                <AssistantNotice
                  variant={
                    datasetMessage.type === "success"
                      ? "success"
                      : datasetMessage.type === "warning"
                        ? "warning"
                        : "error"
                  }
                >
                  {datasetMessage.text}
                </AssistantNotice>
              ) : null}

              <div className="space-y-2">
                {datasets.length === 0 ? (
                  <p className="text-slate-500 text-sm">登録済みデータセットはありません。</p>
                ) : (
                  datasets.map((dataset, index) => {
                    const id = String(dataset.dataset_id ?? dataset.id ?? "");
                    return (
                      <div
                        key={`${id}-${index}`}
                        className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                      >
                        <span className="font-mono">{id || "(IDなし)"}</span>
                        {id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={datasetActionLoading}
                            onClick={() => void removeDataset(id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-1">削除</span>
                          </Button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>

          {showPDFPreview && taskDetails.filename && taskDetails.assessment && taskDetails.status === "completed" ? (
            <div className="grid h-[calc(100vh-20rem)] grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="h-full xl:sticky xl:top-4 xl:self-start">
                <AssistantPdfPreview
                  ref={pdfPreviewRef}
                  fileUrl={`${publicApiBaseUrl}/uploads/${taskDetails.filename as string}`}
                  fileName={taskDetails.filename as string}
                  className="h-full w-full"
                />
              </div>

              <div className="h-full space-y-4 overflow-y-auto">
                <Card>
                  <h4 className="mb-4 font-medium text-md">検証結果</h4>
                  <div
                    className="assessment-content prose prose-sm max-w-none"
                    onClick={handleAssessmentClick}
                    dangerouslySetInnerHTML={{
                      __html: addClickHandlersToAssessmentHtml(taskDetails.assessment as string),
                    }}
                  />
                </Card>
              </div>
            </div>
          ) : (
            <>
              {showPDFPreview && taskDetails.filename ? (
                <div className="h-[calc(100vh-20rem)]">
                  <AssistantPdfPreview
                    ref={pdfPreviewRef}
                    fileUrl={`${publicApiBaseUrl}/uploads/${taskDetails.filename as string}`}
                    fileName={taskDetails.filename as string}
                    className="h-full w-full"
                  />
                </div>
              ) : null}

              {taskDetails.assessment && taskDetails.status === "completed" && !showPDFPreview ? (
                <Card>
                  <h4 className="mb-4 font-medium text-md">検証結果</h4>
                  <div
                    className="assessment-content prose prose-sm max-w-none"
                    onClick={handleAssessmentClick}
                    dangerouslySetInnerHTML={{
                      __html: addClickHandlersToAssessmentHtml(taskDetails.assessment as string),
                    }}
                  />
                </Card>
              ) : null}
            </>
          )}

          {showResearcherHistory &&
          taskDetails.researcher_history &&
          taskDetails.status === "completed" ? (
            <Card>
              <h4 className="mb-4 font-medium text-md">研究者履歴調査結果</h4>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {taskDetails.researcher_history as string}
                </ReactMarkdown>
              </div>

              {Array.isArray(taskDetails.researcher_history_urls) &&
              taskDetails.researcher_history_urls.length > 0 ? (
                <div className="mt-4">
                  <h5 className="mb-2 font-medium text-sm">参考URL</h5>
                  <ul className="space-y-1">
                    {(taskDetails.researcher_history_urls as string[]).map((url, index) => (
                      <li key={`${url}-${index}`} className="text-sm">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-blue-600 underline hover:text-blue-800"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
