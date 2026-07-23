import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { $$getJWT } from "@/utils/jwt-helpers";

export type AssistantTaskStatus = "pending" | "processing" | "completed" | "error" | "failed";

export type AssistantApplicationTask = {
  task_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  status?: AssistantTaskStatus | null;
  application_type?: string | null;
  filename?: string | null;
};

export type AssistantApplicationsListResponse = {
  tasks: AssistantApplicationTask[];
  count: number;
};

export type AssistantTaskDetails = AssistantApplicationTask & {
  id?: string;
  message?: string;
  result?: string;
  assessment?: string;
  error?: string;
  researcher_history?: string;
  researcher_history_urls?: string[];
  ethics_file_path?: string;
  research_plan_path?: string;
  [key: string]: unknown;
};

const AssistantTaskIdSchema = z.object({
  taskId: z.string().trim().min(1),
});

const AssistantAddDatasetsSchema = z.object({
  taskId: z.string().trim().min(1),
  datasetIds: z.array(z.string().trim().min(1)).min(1),
});

const AssistantRemoveDatasetSchema = z.object({
  taskId: z.string().trim().min(1),
  datasetId: z.string().trim().min(1),
});

type RuntimeEnv = Record<string, string | undefined>;

function getRuntimeEnv(): RuntimeEnv {
  return ((globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {}) as RuntimeEnv;
}

function getAssistantInternalApiBaseUrl(): string {
  const env = getRuntimeEnv();
  return (env.HUMANDBS_ASSISTANT_API_BASE_URL ?? "http://assistant-api:8000/api").replace(/\/$/, "");
}

function getAssistantPublicApiBaseUrl(): string {
  const env = getRuntimeEnv();
  return (env.HUMANDBS_ASSISTANT_PUBLIC_BASE_URL ?? "/assistant-api/api").replace(/\/$/, "");
}

function getAssistantClientFlags() {
  const env = getRuntimeEnv();
  return {
    showBatchReanalysisButton: env.HUMANDBS_ASSISTANT_SHOW_BATCH_REANALYZE === "true",
    showResearcherHistory: env.HUMANDBS_ASSISTANT_SHOW_RESEARCHER_HISTORY !== "false",
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { detail?: string; message?: string };
    return json.detail ?? json.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function assistantApiFetch(path: string, init: RequestInit = {}) {
  const accessToken = $$getJWT();
  if (!accessToken) {
    throw new Error("Unauthorized");
  }

  const baseUrl = getAssistantInternalApiBaseUrl();
  const headers = new Headers(init.headers ?? {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("ngrok-skip-browser-warning", "true");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response;
}

export const $getAssistantClientConfig = createServerFn({ method: "GET" }).handler(() => ({
  publicApiBaseUrl: getAssistantPublicApiBaseUrl(),
  ...getAssistantClientFlags(),
}));

export const $listAssistantApplications = createServerFn({ method: "GET" }).handler<
  Promise<AssistantApplicationsListResponse>
>(async () => {
  const response = await assistantApiFetch("/applications", { method: "GET" });
  return (await response.json()) as AssistantApplicationsListResponse;
});

export function getAssistantApplicationsQueryOptions() {
  return queryOptions({
    queryKey: ["assistant", "applications"],
    queryFn: () => $listAssistantApplications(),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });
}

export const $getAssistantApplication = createServerFn({ method: "POST" })
  .inputValidator(AssistantTaskIdSchema)
  .handler<Promise<AssistantTaskDetails>>(async ({ data }) => {
    const response = await assistantApiFetch(`/applications/${data.taskId}`, { method: "GET" });
    return (await response.json()) as AssistantTaskDetails;
  });

export const $uploadAssistantApplication = createServerFn({ method: "POST" })
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ data }) => {
    const response = await assistantApiFetch("/applications", {
      method: "POST",
      body: data,
    });
    return (await response.json()) as Record<string, unknown>;
  });

export const $reanalyzeAssistantApplication = createServerFn({ method: "POST" })
  .inputValidator(AssistantTaskIdSchema)
  .handler(async ({ data }) => {
    const response = await assistantApiFetch(`/applications/${data.taskId}/reanalyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return (await response.json()) as Record<string, unknown>;
  });

export const $batchReanalyzeAssistantApplications = createServerFn({ method: "POST" }).handler(
  async () => {
    const response = await assistantApiFetch("/applications/batch-reanalyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return (await response.json()) as Record<string, unknown>;
  },
);

export const $uploadAssistantAttachments = createServerFn({ method: "POST" })
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ data }) => {
    const taskId = (data.get("taskId") as string | null)?.trim();
    if (!taskId) {
      throw new Error("taskId is required");
    }

    const body = new FormData();
    const ethicsFile = data.get("ethics_file");
    const researchPlanFile = data.get("research_plan_file");

    if (ethicsFile instanceof File) {
      body.set("ethics_file", ethicsFile);
    }
    if (researchPlanFile instanceof File) {
      body.set("research_plan_file", researchPlanFile);
    }

    const response = await assistantApiFetch(`/applications/${taskId}/attachments`, {
      method: "POST",
      body,
    });
    return (await response.json()) as Record<string, unknown>;
  });

export const $addAssistantDatasets = createServerFn({ method: "POST" })
  .inputValidator(AssistantAddDatasetsSchema)
  .handler(async ({ data }) => {
    const response = await assistantApiFetch(`/applications/${data.taskId}/add-datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_ids: data.datasetIds }),
    });
    return (await response.json()) as Record<string, unknown>;
  });

export const $removeAssistantDataset = createServerFn({ method: "POST" })
  .inputValidator(AssistantRemoveDatasetSchema)
  .handler(async ({ data }) => {
    const response = await assistantApiFetch(`/applications/${data.taskId}/remove-dataset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: data.datasetId }),
    });
    return (await response.json()) as Record<string, unknown>;
  });
