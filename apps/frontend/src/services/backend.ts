import { $getResearchList } from "@/serverFunctions/mock/research";
import {
  Dataset,
  DatasetIdParams,
  DatasetsQuery,
  DatasetsResponse,
  DatasetVersionsResponse,
  HumIdParams,
  LangQuery,
  LangVersionQuery,
  Research,
  ResearchesQuery,
  ResearchesResponse,
  ResearchVersionsResponse,
} from "@humandbs/backend/types";
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: `${process.env.HUMANDBS_BACKEND}:${process.env.HUMANDBS_BACKEND_PORT}`,
});

interface APIService {
  getResearchListPaginated(query: {
    search: ResearchesQuery;
  }): Promise<ResearchesResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
  }): Promise<Research>;
  getResearchVersions(query: {
    params: HumIdParams;
    search: LangQuery;
  }): Promise<ResearchVersionsResponse>;
  getDatasetsPaginated(query: {
    search: DatasetsQuery;
  }): Promise<DatasetsResponse>;
  getDataset(query: {
    params: DatasetIdParams;
    search: LangVersionQuery;
  }): Promise<Dataset>;
  getDatasetVersions(query: {
    params: DatasetIdParams;
    search: LangQuery;
  }): Promise<DatasetVersionsResponse>;
}

const api: APIService = {
  async getResearchListPaginated(query) {
    return $getResearchList({
      data: {
        page: query.search.page,
        limit: query.search.limit,
      },
    });
    // return axiosInstance.get("/researches", { params: query.search });
  },
  async getResearchDetail(query) {
    return axiosInstance.get(`/researches/${query.params.humId}`, {
      params: query.search,
    });
  },
  async getResearchVersions(query) {
    return axiosInstance.get(`/researches/${query.params.humId}/versions`, {
      params: query.search,
    });
  },

  async getDatasetsPaginated(query) {
    return axiosInstance.get(`/datasets`, { params: query.search });
  },
  async getDataset(query) {
    return axiosInstance.get(`/datasets.${query.params.datasetId}`, {
      params: query.search,
    });
  },

  async getDatasetVersions(query) {
    return axiosInstance.get(`/datasets/${query.params.datasetId}`, {
      params: query.search,
    });
  },
};

export { api };
