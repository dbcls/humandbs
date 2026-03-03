import {
  type DatasetIdParams,
  type DatasetListingQuery,
  type DatasetVersionsResponse,
  type HumIdParams,
  type LangQuery,
  type LangVersionQuery,
  type ResearchListingQuery,
  ResearchSearchResponseSchema,
  type ResearchVersionsListResponse,
  type ResearchSearchUnifiedResponse,
  type DatasetDetailResponse,
  type DatasetSearchUnifiedResponse,
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
  type WorkflowUnifiedResponse,
  type VersionCreateResponse,
  type DatasetCreateResponse,
} from "@humandbs/backend/types";
import { createIsomorphicFn } from "@tanstack/react-start";
import axios, { type AxiosError } from "axios";
import { z } from "zod";

// Extend Error type to include custom properties
declare global {
  interface Error {
    status?: number;
    data?: any;
  }
}

const getBackendBaseUrl = createIsomorphicFn()
  .client(() => {
    return `/api`;
  })
  .server(
    () =>
      `http://${process.env.HUMANDBS_BACKEND_HOST}:${process.env.HUMANDBS_BACKEND_PORT}${process.env.HUMANDBS_BACKEND_URL_PREFIX}`,
  );

const axiosInstance = axios.create({
  baseURL: getBackendBaseUrl(),
});

// Add response interceptor to handle errors properly
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle Axios errors more gracefully to prevent crashes
    const url = error.config?.url || "unknown";
    const method = error.config?.method?.toUpperCase() || "unknown";

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`API Error: ${method} ${url} - ${error.response.status}`, {
        status: error.response.status,
        data: error.response.data,
        url: url,
      });

      const customError = new Error(
        `API Error: ${error.response.status} - ${method} ${url}`,
      );
      customError.name = "APIError";
      customError.status = error.response.status;
      customError.data = error.response.data;

      return Promise.reject(customError);
    } else if (error.request) {
      // The request was made but no response was received
      console.error(`Network Error: ${method} ${url} - No response received`);
      const customError = new Error(
        `Network Error: No response received - ${method} ${url}`,
      );
      customError.name = "NetworkError";
      return Promise.reject(customError);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(`Request Error: ${method} ${url} - ${error.message}`);
      const customError = new Error(
        `Request Error: ${error.message} - ${method} ${url}`,
      );
      customError.name = "RequestError";
      return Promise.reject(customError);
    }
  },
);

interface APIService {
  getResearchListPaginated(query: {
    search: ResearchListingQuery;
  }): Promise<ResearchSearchUnifiedResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
  }): Promise<ResearchDetailResponse>;
  getResearchVersions(query: {
    params: HumIdParams;
    search: LangQuery;
  }): Promise<ResearchVersionsListResponse>;
  getDatasetsPaginated(query: {
    search: DatasetListingQuery;
  }): Promise<DatasetSearchUnifiedResponse>;
  getDataset(query: {
    params: DatasetIdParams;
    search: LangVersionQuery;
  }): Promise<DatasetDetailResponse>;
  getDatasetVersions(query: {
    params: DatasetIdParams;
    search: LangQuery;
  }): Promise<DatasetVersionsResponse>;
  searchResearches(
    query: ResearchSearchBody,
  ): Promise<ResearchSearchUnifiedResponse>;
  searchDatasets(
    query: DatasetSearchBody,
  ): Promise<DatasetSearchUnifiedResponse>;
  getAllFacets(): Promise<{ data: AllFacetsResponse }>;
  createResearch(body: CreateResearchRequest): Promise<ResearchWithLockResponse>;
  updateResearch(
    humId: string,
    body: UpdateResearchRequest,
  ): Promise<ResearchWithLockResponse>;
  deleteResearch(humId: string): Promise<void>;
  updateResearchUids(
    humId: string,
    body: UpdateUidsRequest,
  ): Promise<ResearchWithLockResponse>;
  createResearchVersion(
    humId: string,
    body: CreateVersionRequest,
  ): Promise<VersionCreateResponse>;
  submitResearch(humId: string): Promise<WorkflowUnifiedResponse>;
  approveResearch(humId: string): Promise<WorkflowUnifiedResponse>;
  rejectResearch(humId: string): Promise<WorkflowUnifiedResponse>;
  unpublishResearch(humId: string): Promise<WorkflowUnifiedResponse>;
  createDatasetForResearch(
    humId: string,
    body: CreateDatasetForResearchRequest,
  ): Promise<DatasetCreateResponse>;
}

export const FixedPaginationSchema =
  ResearchSearchResponseSchema.shape.pagination.extend({
    limit: z.coerce.number(),
    page: z.coerce.number(),
  });

const api: APIService = {
  async getResearchListPaginated(query) {
    const res = await axiosInstance.get<ResearchSearchUnifiedResponse>(
      `/research`,
      {
        params: query.search,
      },
    );
    return res.data;
  },

  async getResearchDetail(query) {
    const res = await axiosInstance.get<ResearchDetailResponse>(
      `/research/${query.params.humId}`,
      {
        params: query.search,
      },
    );

    return res.data;
  },
  async getResearchVersions(query) {
    const res = await axiosInstance.get<ResearchVersionsListResponse>(
      `/research/${query.params.humId}/versions`,
      {
        params: query.search,
      },
    );

    return res.data;
  },

  async getDatasetsPaginated(query) {
    const res = await axiosInstance.get(`/dataset`, {
      params: query.search,
    });
    return res.data as DatasetSearchUnifiedResponse;
  },

  async getDataset(query) {
    const res = await axiosInstance.get<DatasetDetailResponse>(
      `/dataset/${query.params.datasetId}`,
      {
        params: query.search,
      },
    );
    return res.data;
  },

  async getDatasetVersions(query) {
    const res = await axiosInstance.get<DatasetVersionsResponse>(
      `/dataset/${query.params.datasetId}/versions`,
      {
        params: query.search,
      },
    );

    return res.data;
  },

  async searchResearches(query) {
    const res = await axiosInstance<ResearchSearchUnifiedResponse>({
      method: "POST",
      url: `/research/search`,
      data: query,
    });

    return res.data;
  },
  async searchDatasets(query) {
    const res = await axiosInstance<DatasetSearchUnifiedResponse>({
      method: "POST",
      url: `/dataset/search`,
      data: query,
    });

    return res.data;
  },
  async getAllFacets() {
    const res = await axiosInstance.get<{ data: AllFacetsResponse }>(`/facets`);

    return res.data;
  },

  async createResearch(body) {
    const res = await axiosInstance.post<ResearchWithLockResponse>(
      `/research/new`,
      body,
    );
    return res.data;
  },

  async updateResearch(humId, body) {
    const res = await axiosInstance.put<ResearchWithLockResponse>(
      `/research/${humId}/update`,
      body,
    );
    return res.data;
  },

  async deleteResearch(humId) {
    await axiosInstance.post(`/research/${humId}/delete`);
  },

  async updateResearchUids(humId, body) {
    const res = await axiosInstance.put<ResearchWithLockResponse>(
      `/research/${humId}/uids`,
      body,
    );
    return res.data;
  },

  async createResearchVersion(humId, body) {
    const res = await axiosInstance.post<VersionCreateResponse>(
      `/research/${humId}/versions/new`,
      body,
    );
    return res.data;
  },

  async submitResearch(humId) {
    const res = await axiosInstance.post<WorkflowUnifiedResponse>(
      `/research/${humId}/submit`,
    );
    return res.data;
  },

  async approveResearch(humId) {
    const res = await axiosInstance.post<WorkflowUnifiedResponse>(
      `/research/${humId}/approve`,
    );
    return res.data;
  },

  async rejectResearch(humId) {
    const res = await axiosInstance.post<WorkflowUnifiedResponse>(
      `/research/${humId}/reject`,
    );
    return res.data;
  },

  async unpublishResearch(humId) {
    const res = await axiosInstance.post<WorkflowUnifiedResponse>(
      `/research/${humId}/unpublish`,
    );
    return res.data;
  },

  async createDatasetForResearch(humId, body) {
    const res = await axiosInstance.post<DatasetCreateResponse>(
      `/research/${humId}/dataset/new`,
      body,
    );
    return res.data;
  },
};

export { api };
