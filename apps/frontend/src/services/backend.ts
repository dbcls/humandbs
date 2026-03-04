import {
  type DatasetIdParams,
  type DatasetListingQuery,
  type DatasetVersionsListResponse,
  type HumIdParams,
  type LangQuery,
  type LangVersionQuery,
  type ResearchListingQuery,
  ResearchSearchResponseSchema,
  type ResearchVersionsListResponse,
  type ResearchSearchResponse,
  type DatasetDetailResponse,
  type DatasetSearchResponse,
  type ResearchDetailResponse,
  type ResearchSearchBody,
  type AllFacetsResponse,
  type DatasetSearchBody,
  type CreateResearchRequest,
  type UpdateResearchRequest,
  type UpdateUidsRequest,
  type CreateVersionRequest,
  type CreateDatasetForResearchRequest,
  type ResearchWithLockResponse,
  type WorkflowResponse,
  type VersionCreateResponse,
  type DatasetCreateResponse,
} from "@humandbs/backend/types";
import { createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const getBackendBaseUrl = createIsomorphicFn()
  .client(() => `/api`)
  .server(
    () =>
      `http://${process.env.HUMANDBS_BACKEND_HOST}:${process.env.HUMANDBS_BACKEND_PORT}${process.env.HUMANDBS_BACKEND_URL_PREFIX}`,
  );

export class APIError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, method: string, url: string, data: unknown) {
    super(`API Error: ${status} - ${method} ${url}`);
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
      url: path,
    });
    throw new APIError(res.status, method, path, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function get<T>(
  path: string,
  params?: Record<string, unknown>,
  headers?: HeadersInit,
) {
  return request<T>(path, { method: "GET", params, headers });
}

function post<T>(path: string, body: unknown, headers?: HeadersInit) {
  return request<T>(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
    headers,
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
  getResearchListPaginated(query: {
    search: ResearchListingQuery;
  }): Promise<ResearchSearchResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
    accessToken?: string;
  }): Promise<ResearchDetailResponse>;
  getResearchVersions(query: {
    params: HumIdParams;
    search: LangQuery;
  }): Promise<ResearchVersionsListResponse>;
  getDatasetsPaginated(query: {
    search: DatasetListingQuery;
  }): Promise<DatasetSearchResponse>;
  getDataset(query: {
    params: DatasetIdParams;
    search: LangVersionQuery;
  }): Promise<DatasetDetailResponse>;
  getDatasetVersions(query: {
    params: DatasetIdParams;
    search: LangQuery;
  }): Promise<DatasetVersionsListResponse>;
  searchResearches(
    query: ResearchSearchBody,
    accessToken?: string,
  ): Promise<ResearchSearchResponse>;
  searchDatasets(
    query: DatasetSearchBody,
    accessToken?: string,
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
  approveResearch(
    humId: string,
    accessToken: string,
  ): Promise<WorkflowResponse>;
  rejectResearch(humId: string, accessToken: string): Promise<WorkflowResponse>;
  unpublishResearch(
    humId: string,
    accessToken: string,
  ): Promise<WorkflowResponse>;
  createDatasetForResearch(
    humId: string,
    body: CreateDatasetForResearchRequest,
    accessToken: string,
  ): Promise<DatasetCreateResponse>;
}

export const FixedPaginationSchema =
  ResearchSearchResponseSchema.shape.pagination.extend({
    limit: z.coerce.number(),
    page: z.coerce.number(),
  });

const api: APIService = {
  getResearchListPaginated(query) {
    return get<ResearchSearchResponse>(
      `/research`,
      query.search as Record<string, unknown>,
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
    );
  },

  getDatasetsPaginated(query) {
    return get<DatasetSearchResponse>(
      `/dataset`,
      query.search as Record<string, unknown>,
    );
  },

  getDataset(query) {
    return get<DatasetDetailResponse>(
      `/dataset/${query.params.datasetId}`,
      query.search as Record<string, unknown>,
    );
  },

  getDatasetVersions(query) {
    return get<DatasetVersionsListResponse>(
      `/dataset/${query.params.datasetId}/versions`,
      query.search as Record<string, unknown>,
    );
  },

  searchResearches(query, accessToken) {
    return post<ResearchSearchResponse>(
      `/research/search`,
      query,
      accessToken ? authHeader(accessToken) : undefined,
    );
  },

  searchDatasets(query, accessToken) {
    return post<DatasetSearchResponse>(
      `/dataset/search`,
      query,
      accessToken ? authHeader(accessToken) : undefined,
    );
  },

  getAllFacets() {
    return get<{ data: AllFacetsResponse }>(`/facets`);
  },

  createResearch(body, accessToken) {
    return post<ResearchWithLockResponse>(
      `/research/new`,
      body,
      authHeader(accessToken),
    );
  },

  updateResearch(humId, body, accessToken) {
    return put<ResearchWithLockResponse>(
      `/research/${humId}/update`,
      body,
      authHeader(accessToken),
    );
  },

  async deleteResearch(humId, accessToken) {
    await post<undefined>(
      `/research/${humId}/delete`,
      null,
      authHeader(accessToken),
    );
  },

  updateResearchUids(humId, body, accessToken) {
    return put<ResearchWithLockResponse>(
      `/research/${humId}/uids`,
      body,
      authHeader(accessToken),
    );
  },

  createResearchVersion(humId, body, accessToken) {
    return post<VersionCreateResponse>(
      `/research/${humId}/versions/new`,
      body,
      authHeader(accessToken),
    );
  },

  submitResearch(humId, accessToken) {
    return post<WorkflowResponse>(
      `/research/${humId}/submit`,
      null,
      authHeader(accessToken),
    );
  },

  approveResearch(humId, accessToken) {
    return post<WorkflowResponse>(
      `/research/${humId}/approve`,
      null,
      authHeader(accessToken),
    );
  },

  rejectResearch(humId, accessToken) {
    return post<WorkflowResponse>(
      `/research/${humId}/reject`,
      null,
      authHeader(accessToken),
    );
  },

  unpublishResearch(humId, accessToken) {
    return post<WorkflowResponse>(
      `/research/${humId}/unpublish`,
      null,
      authHeader(accessToken),
    );
  },

  createDatasetForResearch(humId, body, accessToken) {
    return post<DatasetCreateResponse>(
      `/research/${humId}/dataset/new`,
      body,
      authHeader(accessToken),
    );
  },
};

export { api };
