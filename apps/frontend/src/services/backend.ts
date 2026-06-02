import { createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  AllFacetsResponse,
  CreateDatasetForResearchRequest,
  CreateResearchRequest,
  CreateVersionRequest,
  DatasetCreateResponse,
  DatasetDetailResponse,
  DatasetIdParams,
  DatasetListingQuery,
  DatasetSearchBody,
  DatasetSearchResponse,
  DatasetUpdateResponse,
  DatasetVersionsListResponse,
  HumIdParams,
  LangQuery,
  LangVersionQuery,
  LinkedDatasetsListResponse,
  ResearchDetailResponse,
  ResearchListingQuery,
  ResearchSearchBody,
  ResearchSearchResponse,
  ResearchVersionsListResponse,
  ResearchWithLockResponse,
  UpdateDatasetRequest,
  UpdateResearchRequest,
  UpdateUidsRequest,
  VersionCreateResponse,
  WorkflowResponse,
} from "@humandbs/backend/types";
import { ResearchSearchResponseSchema } from "@humandbs/backend/types";

import type { ResearchSearchResponseWithTypedCriteria } from "@/lib/types";
import type { DeepOmit } from "@/utils/type-utils";

import type { DsApplicationListResponse } from "../../../backend/src/api/types";
import type {
  DatasetTemplateResponse,
  ResearchTemplateResponse,
} from "../../../backend/src/api/types/templates";

const getBackendBaseUrl = createIsomorphicFn()
  .client(() => `/api`)
  .server(
    () =>
      process.env.HUMANDBS_BACKEND_BASE_URL ??
      `http://${process.env.HUMANDBS_BACKEND_HOST}:${process.env.HUMANDBS_BACKEND_PORT}${process.env.HUMANDBS_BACKEND_URL_PREFIX}`,
  );

export class APIError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, method: string, url: string, data: unknown) {
    super(`API Error: ${status} - ${method} ${url}`);
    Object.setPrototypeOf(this, APIError.prototype);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { params?: Record<string, unknown> } = {},
): Promise<T> {
  const { params, ...init } = options;

  const baseUrl = getBackendBaseUrl();
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const url = new URL(path.replace(/^\//, ""), base);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value),
        );
      }
    }
  }

  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url.toString(), { ...init, headers });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    console.error(`API Error: ${method} ${path} - ${res.status}`, {
      status: res.status,
      data,
      body: init?.body,
      url: path,
    });
    throw new APIError(res.status, method, path, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function get<T>(path: string, params?: Record<string, unknown>, headers?: HeadersInit) {
  return request<T>(path, { method: "GET", params, headers });
}

function post<T>(path: string, body: unknown, headers?: HeadersInit, signal?: AbortSignal) {
  return request<T>(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
    headers,
    signal,
  });
}

function put<T>(path: string, body: unknown, headers?: HeadersInit) {
  return request<T>(path, {
    method: "PUT",
    body: body != null ? JSON.stringify(body) : undefined,
    headers,
  });
}

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

interface APIService {
  getResearchListPaginated(
    query: {
      search: ResearchListingQuery;
    },
    accessToken?: string,
  ): Promise<ResearchSearchResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
    accessToken?: string;
  }): Promise<ResearchDetailResponse>;
  getResearchVersions(query: {
    params: HumIdParams;
    search: LangQuery;
    accessToken?: string;
  }): Promise<ResearchVersionsListResponse>;
  getResearchDatasets(
    query: { humId: string },
    accessToken?: string,
  ): Promise<LinkedDatasetsListResponse>;
  getDatasetsPaginated(query: { search: DatasetListingQuery }): Promise<DatasetSearchResponse>;
  getDataset(query: {
    params: DatasetIdParams;
    search: LangVersionQuery;
    accessToken?: string;
  }): Promise<DatasetDetailResponse>;
  getDatasetVersions(query: {
    params: DatasetIdParams;
    search: LangQuery;
  }): Promise<DatasetVersionsListResponse>;
  searchResearches(
    query: ResearchSearchBody,
    accessToken?: string,
    signal?: AbortSignal,
  ): Promise<ResearchSearchResponseWithTypedCriteria>;
  searchDatasets(
    query: DatasetSearchBody,
    accessToken?: string,
    signal?: AbortSignal,
  ): Promise<DatasetSearchResponse>;
  getAllFacets(): Promise<{ data: AllFacetsResponse }>;
  createResearch(
    body: CreateResearchRequest,
    accessToken: string,
  ): Promise<ResearchWithLockResponse>;
  updateResearch(
    humId: string,
    body: UpdateResearchRequest,
    accessToken: string,
  ): Promise<ResearchWithLockResponse>;
  deleteResearch(humId: string, accessToken: string): Promise<void>;
  updateResearchUids(
    humId: string,
    body: UpdateUidsRequest,
    accessToken: string,
  ): Promise<ResearchWithLockResponse>;
  createResearchVersion(
    humId: string,
    body: CreateVersionRequest,
    accessToken: string,
  ): Promise<VersionCreateResponse>;
  submitResearch(humId: string, accessToken: string): Promise<WorkflowResponse>;
  approveResearch(humId: string, accessToken: string): Promise<WorkflowResponse>;
  rejectResearch(humId: string, accessToken: string): Promise<WorkflowResponse>;
  unpublishResearch(humId: string, accessToken: string): Promise<WorkflowResponse>;
  createDatasetForResearch(
    humId: string,
    body: DeepOmit<CreateDatasetForResearchRequest, "rawHtml">,
    accessToken: string,
  ): Promise<DatasetCreateResponse>;
  updateDataset(
    datasetId: string,
    body: UpdateDatasetRequest,
    accessToken: string,
  ): Promise<DatasetUpdateResponse>;
  deleteDataset(datasetId: string, accessToken: string): Promise<void>;
  getResearchTemplate(jdsId: string, accessToken: string): Promise<ResearchTemplateResponse>;
  getDatasetTemplate(externalId: string, accessToken: string): Promise<DatasetTemplateResponse>;
  listDsApplications(
    query: { page: number; limit: number },
    accessToken: string,
  ): Promise<DsApplicationListResponse>;
}

export const FixedPaginationSchema =
  ResearchSearchResponseSchema.shape.meta.shape.pagination.extend({
    limit: z.coerce.number(),
    page: z.coerce.number(),
  });

const api: APIService = {
  getResearchListPaginated(query, accessToken) {
    return get<ResearchSearchResponse>(
      `/research`,
      query.search as Record<string, unknown>,
      accessToken ? authHeader(accessToken) : undefined,
    );
  },

  getResearchDetail(query) {
    return get<ResearchDetailResponse>(
      `/research/${query.params.humId}`,
      query.search as Record<string, unknown>,
      query.accessToken ? authHeader(query.accessToken) : undefined,
    );
  },

  getResearchVersions(query) {
    return get<ResearchVersionsListResponse>(
      `/research/${query.params.humId}/versions`,
      query.search as Record<string, unknown>,
      query.accessToken ? authHeader(query.accessToken) : undefined,
    );
  },

  getResearchDatasets(query, accessToken) {
    return get<LinkedDatasetsListResponse>(
      `research/${query.humId}/dataset`,
      undefined,
      accessToken ? authHeader(accessToken) : undefined,
    );
  },

  getDatasetsPaginated(query) {
    return get<DatasetSearchResponse>(`/dataset`, query.search as Record<string, unknown>);
  },

  getDataset(query) {
    return get<DatasetDetailResponse>(
      `/dataset/${query.params.datasetId}`,
      query.search as Record<string, unknown>,
      query.accessToken ? authHeader(query.accessToken) : undefined,
    );
  },

  getDatasetVersions(query) {
    return get<DatasetVersionsListResponse>(
      `/dataset/${query.params.datasetId}/versions`,
      query.search as Record<string, unknown>,
    );
  },

  searchResearches(query, accessToken, signal) {
    return post<ResearchSearchResponseWithTypedCriteria>(
      `/research/search`,
      query,
      accessToken ? authHeader(accessToken) : undefined,
      signal,
    );
  },

  searchDatasets(query, accessToken, signal) {
    return post<DatasetSearchResponse>(
      `/dataset/search`,
      query,
      accessToken ? authHeader(accessToken) : undefined,
      signal,
    );
  },

  getAllFacets() {
    return get<{ data: AllFacetsResponse }>(`/facets`);
  },

  createResearch(body, accessToken) {
    return post<ResearchWithLockResponse>(`/research/new`, body, authHeader(accessToken));
  },

  updateResearch(humId, body, accessToken) {
    return put<ResearchWithLockResponse>(
      `/research/${humId}/update`,
      body,
      authHeader(accessToken),
    );
  },

  async deleteResearch(humId, accessToken) {
    await post<undefined>(`/research/${humId}/delete`, null, authHeader(accessToken));
  },

  updateResearchUids(humId, body, accessToken) {
    return put<ResearchWithLockResponse>(`/research/${humId}/uids`, body, authHeader(accessToken));
  },

  createResearchVersion(humId, body, accessToken) {
    return post<VersionCreateResponse>(
      `/research/${humId}/versions/new`,
      body,
      authHeader(accessToken),
    );
  },

  submitResearch(humId, accessToken) {
    return post<WorkflowResponse>(`/research/${humId}/submit`, null, authHeader(accessToken));
  },

  approveResearch(humId, accessToken) {
    return post<WorkflowResponse>(`/research/${humId}/approve`, null, authHeader(accessToken));
  },

  rejectResearch(humId, accessToken) {
    return post<WorkflowResponse>(`/research/${humId}/reject`, null, authHeader(accessToken));
  },

  unpublishResearch(humId, accessToken) {
    return post<WorkflowResponse>(`/research/${humId}/unpublish`, null, authHeader(accessToken));
  },

  createDatasetForResearch(humId, body, accessToken) {
    return post<DatasetCreateResponse>(
      `/research/${humId}/dataset/new`,
      body,
      authHeader(accessToken),
    );
  },

  updateDataset(datasetId, body, accessToken) {
    return put<DatasetUpdateResponse>(
      `/dataset/${datasetId}/update`,
      body,
      authHeader(accessToken),
    );
  },

  deleteDataset(datasetId, accessToken) {
    return post<void>(`/dataset/${datasetId}/delete`, null, authHeader(accessToken));
  },

  getResearchTemplate(jdsId, accessToken) {
    return get<ResearchTemplateResponse>(
      `/templates/research/${jdsId}`,
      undefined,
      authHeader(accessToken),
    );
  },

  getDatasetTemplate(externalId, accessToken) {
    return get<DatasetTemplateResponse>(
      `/templates/dataset/${externalId}`,
      undefined,
      authHeader(accessToken),
    );
  },

  listDsApplications(query, accessToken) {
    return get<DsApplicationListResponse>(
      `/jga-shinsei/ds`,
      query as Record<string, unknown>,
      authHeader(accessToken),
    );
  },
};

export { api };

type StandardErrorCode = "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";

export function mapApiError<C extends string = never>(
  error: unknown,
  fallback: string,
  extraMappings?: Partial<Record<number, C>>,
): { ok: false; error: string; code: StandardErrorCode | C } {
  if (error instanceof APIError) {
    const detail = (error.data as { detail?: string } | undefined)?.detail ?? fallback;
    const extra = extraMappings?.[error.status];
    if (extra !== undefined) return { ok: false, error: detail, code: extra };
    if (error.status === 409) return { ok: false, error: detail, code: "CONFLICT" };
    if (error.status === 403) return { ok: false, error: detail, code: "FORBIDDEN" };
    if (error.status === 404) return { ok: false, error: detail, code: "NOT_FOUND" };
    if (error.status === 401) return { ok: false, error: detail, code: "UNAUTHORIZED" };
  }
  throw error;
}
