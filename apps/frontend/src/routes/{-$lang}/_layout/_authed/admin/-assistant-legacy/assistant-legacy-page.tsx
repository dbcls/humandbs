import type React from "react";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $getAssistantClientConfig, $uploadAssistantApplication } from "@/serverFunctions/assistant";

import { AssistantTaskStatusPanel } from "./assistant-task-status";
import { AssistantNotice } from "./assistant-ui";

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="space-y-2">
      <progress className="h-2 w-full overflow-hidden rounded" max={100} value={value} />
      <p className="text-right text-slate-500 text-xs">{value}% 完了</p>
    </div>
  );
}

function AssistantUploadForm({ onTaskCreated }: { onTaskCreated: (taskId: string) => void }) {
  const [applicationFile, setApplicationFile] = useState<File | null>(null);
  const [ethicsFile, setEthicsFile] = useState<File | null>(null);
  const [researchPlanFile, setResearchPlanFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    errorMessage: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setError(errorMessage);
      return;
    }

    setFile(file);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!applicationFile) {
      setError("申請書PDFファイルを選択してください");
      return;
    }

    setUploading(true);
    setError(null);
    setTaskId(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.set("application_file", applicationFile);
      if (ethicsFile) {
        formData.set("ethics_file", ethicsFile);
      }
      if (researchPlanFile) {
        formData.set("research_plan_file", researchPlanFile);
      }

      setProgress(50);
      const response = await $uploadAssistantApplication({ data: formData });
      const newTaskId =
        (response.task_id as string | undefined) ??
        (response.id as string | undefined) ??
        (response.taskId as string | undefined);

      if (!newTaskId) {
        throw new Error("申請IDが取得できませんでした");
      }

      setTaskId(newTaskId);
      setProgress(100);
      onTaskCreated(newTaskId);
      setApplicationFile(null);
      setEthicsFile(null);
      setResearchPlanFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assistant-application-pdf-upload">申請書PDFファイル（必須）</Label>
          <div className="flex items-center gap-2">
            <Input
              id="assistant-application-pdf-upload"
              type="file"
              accept=".pdf"
              onChange={(event) =>
                handleFileChange(event, setApplicationFile, "申請書はPDFファイルを選択してください")
              }
              disabled={uploading}
              className="max-w-xs cursor-pointer"
            />
            {applicationFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setApplicationFile(null)}
                disabled={uploading}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {applicationFile ? (
            <p className="text-slate-600 text-sm">選択済み: {applicationFile.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assistant-ethics-pdf-upload">研究実施許可PDFファイル（任意）</Label>
          <div className="flex items-center gap-2">
            <Input
              id="assistant-ethics-pdf-upload"
              type="file"
              accept=".pdf"
              onChange={(event) =>
                handleFileChange(event, setEthicsFile, "倫理関係書類はPDFファイルを選択してください")
              }
              disabled={uploading}
              className="max-w-xs cursor-pointer"
            />
            {ethicsFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEthicsFile(null)}
                disabled={uploading}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {ethicsFile ? <p className="text-slate-600 text-sm">選択済み: {ethicsFile.name}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assistant-research-plan-pdf-upload">研究計画書PDFファイル（任意）</Label>
          <div className="flex items-center gap-2">
            <Input
              id="assistant-research-plan-pdf-upload"
              type="file"
              accept=".pdf"
              onChange={(event) =>
                handleFileChange(
                  event,
                  setResearchPlanFile,
                  "研究計画書はPDFファイルを選択してください",
                )
              }
              disabled={uploading}
              className="max-w-xs cursor-pointer"
            />
            {researchPlanFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setResearchPlanFile(null)}
                disabled={uploading}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {researchPlanFile ? (
            <p className="text-slate-600 text-sm">選択済み: {researchPlanFile.name}</p>
          ) : null}
        </div>

        <Button type="submit" disabled={uploading || !applicationFile}>
          {uploading ? (
            <Upload className="mr-2 h-4 w-4 animate-pulse" />
          ) : (
            <FileUp className="mr-2 h-4 w-4" />
          )}
          アップロード
        </Button>

        {uploading ? <ProgressBar value={progress} /> : null}
      </form>

      {taskId ? (
        <AssistantNotice variant="success">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div>アップロードが完了しました。申請ID: {taskId}</div>
          </div>
        </AssistantNotice>
      ) : null}

      {error ? (
        <AssistantNotice variant="error">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        </AssistantNotice>
      ) : null}
    </div>
  );
}

export function AssistantLegacyPage() {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: config } = useQuery({
    queryKey: ["assistant", "client-config"],
    queryFn: () => $getAssistantClientConfig(),
    staleTime: 1000 * 60,
  });

  const handleTaskCreated = (taskId: string) => {
    setCurrentTaskId(taskId);
    setRefreshKey((prev) => prev + 1);
  };

  const publicApiBaseUrl = config?.publicApiBaseUrl ?? "/assistant-api/api";

  return (
    <Card
      className="assistant-legacy-font-scope flex h-full min-w-0 flex-1 flex-col overflow-scroll"
      caption="AI Application Assistant"
    >
      <div className="space-y-8">
        <div className="rounded-lg border p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-xl">申請書PDFアップロード（1ファイル100MBまで）</h2>
          <AssistantUploadForm onTaskCreated={handleTaskCreated} />
        </div>

        <div className="rounded-lg border p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-xl">処理状況確認</h2>
          <AssistantTaskStatusPanel
            key={refreshKey}
            currentTaskId={currentTaskId}
            publicApiBaseUrl={publicApiBaseUrl}
            showBatchReanalysisButton={Boolean(config?.showBatchReanalysisButton)}
            showResearcherHistory={config?.showResearcherHistory ?? true}
          />
        </div>
      </div>
    </Card>
  );
}
