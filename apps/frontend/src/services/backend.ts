import {
  type DatasetDoc,
  type DatasetIdParams,
  type DatasetListingQuery,
  type DatasetSearchResponse,
  DatasetSearchResponseSchema,
  type DatasetVersionsResponse,
  type HumIdParams,
  type LangQuery,
  type LangVersionQuery,
  type ResearchDetail,
  type ResearchSearchQuery,
  type ResearchSearchResponse,
  ResearchSearchResponseSchema,
  type ResearchVersionsResponse,
} from "@humandbs/backend/types";
import { createIsomorphicFn } from "@tanstack/react-start";
import axios from "axios";
import { z } from "zod";

import type { ResearchListResponse } from "../../../backend/src/api/types";

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
    search: ResearchSearchQuery;
  }): Promise<ResearchListResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
  }): Promise<ResearchDetail>;
  getResearchVersions(query: {
    params: HumIdParams;
    search: LangQuery;
  }): Promise<ResearchVersionsResponse>;
  getDatasetsPaginated(query: {
    search: DatasetListingQuery;
  }): Promise<DatasetSearchResponse>;
  getDataset(query: {
    params: DatasetIdParams;
    search: LangVersionQuery;
  }): Promise<DatasetDoc>;
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

const DatasetsResponseFixedSchema = DatasetSearchResponseSchema.extend({
  pagination: FixedPaginationSchema,
});

const api: APIService = {
  async getResearchListPaginated(query) {
    const res = await axiosInstance.get(`/research`, {
      params: query.search,
    });
    return res.data as ResearchListResponse;
  },
  async getResearchDetail(query) {
    let params = {} as LangVersionQuery;
    if (query.search.version) {
      params = { ...query.search };
    } else {
      params = { lang: query.search.lang };
    }

    const res = await axiosInstance.get(`/research/${query.params.humId}`, {
      params: params,
    });

    return res.data;
  },
  async getResearchVersions(query) {
    const res = await axiosInstance.get(
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
    return DatasetsResponseFixedSchema.parse(res.data);
  },

  async getDataset(query) {
    const res = await axiosInstance.get(`/dataset/${query.params.datasetId}`, {
      params: query.search,
    });
    return res.data;
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
