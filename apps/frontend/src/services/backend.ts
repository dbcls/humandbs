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
  getAllFacets(): Promise<{ data: AllFacetsResponse }>;
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
  async getAllFacets() {
    const res = await axiosInstance.get<{ data: AllFacetsResponse }>(`/facets`);

    return res.data;
  },
};

export { api };
