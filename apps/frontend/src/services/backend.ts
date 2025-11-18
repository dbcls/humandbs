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
  ResearchDetail,
  ResearchesQuery,
  ResearchesResponse,
  ResearchVersionsResponse,
} from "@humandbs/backend/types";
import axios, { AxiosPromise } from "axios";

const axiosInstance = axios.create({
  baseURL: `http://${process.env.HUMANDBS_BACKEND}:${process.env.HUMANDBS_BACKEND_PORT}`,
});

interface APIService {
  getResearchListPaginated(query: {
    search: ResearchesQuery;
  }): Promise<ResearchesResponse>;
  getResearchDetail(query: {
    params: HumIdParams;
    search: LangVersionQuery;
  }): Promise<ResearchDetail>;
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
    const res = await axiosInstance.get("/researches", {
      params: query.search,
    });
    return res.data;
  },
  async getResearchDetail(query) {
    let params = {} as LangVersionQuery;
    if (query.search.version) {
      params = { ...query.search };
    } else {
      params = { lang: query.search.lang };
    }

    const res = await axiosInstance.get(`/researches/${query.params.humId}`, {
      params: params,
    });

    return res.data;
  },
  async getResearchVersions(query) {
    const res = await axiosInstance.get(
      `/researches/${query.params.humId}/versions`,
      {
        params: query.search,
      }
    );

    return res.data;
  },

  async getDatasetsPaginated(query) {
    const res = await axiosInstance.get(`/datasets`, { params: query.search });
    return res.data;
  },

  async getDataset(query) {
    return axiosInstance.get(`/datasets.${query.params.datasetId}`, {
      params: query.search,
    });
  },

  async getDatasetVersions(query) {
    const res = await axiosInstance.get(
      `/datasets/${query.params.datasetId}/versions`,
      {
        params: query.search,
      }
    );

    return res.data;
  },
};

export { api };
