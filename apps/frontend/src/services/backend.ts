import {
  type DatasetDoc,
  type DatasetIdParams,
  type DatasetListingQuery,
  DatasetSearchResponseSchema,
  type DatasetVersionsResponse,
  type HumIdParams,
  type LangQuery,
  type LangVersionQuery,
  type ResearchDetail,
  type ResearchListingQuery,
  ResearchSearchResponseSchema,
  type ResearchVersionsListResponse,
  type ResearchSearchUnifiedResponse,
  DatasetDetailResponseSchema,
  type DatasetDetailResponse,
  type DatasetSearchUnifiedResponse,
  type ResearchDetailResponse,
} from "@humandbs/backend/types";
import { createIsomorphicFn } from "@tanstack/react-start";
import axios from "axios";
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
  (error) => {
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
}

export const FixedPaginationSchema =
  ResearchSearchResponseSchema.shape.pagination.extend({
    limit: z.coerce.number(),
    page: z.coerce.number(),
  });

const api: APIService = {
  async getResearchListPaginated(query) {
    const res = await axiosInstance.get(`/research`, {
      params: query.search,
    });
    return res.data as ResearchSearchUnifiedResponse;
  },

  async getResearchDetail(query) {
    // let params = {} as LangVersionQuery;
    // if (query.search.version) {
    //   params = {  ...query.search, includeRawHtml: false };
    // } else {
    //   params = { lang: query.search.lang, includeRawHtml: false };
    // }

    const res = await axiosInstance.get(`/research/${query.params.humId}`, {
      params: query.search,
    });

    return res.data as ResearchDetailResponse;
  },
  async getResearchVersions(query) {
    const res = await axiosInstance.get(
      `/research/${query.params.humId}/versions`,
      {
        params: query.search,
      },
    );

    return res.data as ResearchVersionsListResponse;
  },

  async getDatasetsPaginated(query) {
    const res = await axiosInstance.get(`/dataset`, {
      params: query.search,
    });
    return res.data as DatasetSearchUnifiedResponse;
  },

  async getDataset(query) {
    const res = await axiosInstance.get(`/dataset/${query.params.datasetId}`, {
      params: query.search,
    });
    return res.data as DatasetDetailResponse;
  },

  async getDatasetVersions(query) {
    const res = await axiosInstance.get(
      `/dataset/${query.params.datasetId}/versions`,
      {
        params: query.search,
      },
    );

    return res.data;
  },
};

export { api };
