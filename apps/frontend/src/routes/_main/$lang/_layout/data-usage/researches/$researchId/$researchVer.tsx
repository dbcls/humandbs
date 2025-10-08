import { createFileRoute } from "@tanstack/react-router";

import { CardWithCaption } from "@/components/Card";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";

import { ResearchData } from "../index";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-usage/researches/$researchId/$researchVer"
)({
  component: RouteComponent,
});

interface Sequence {
  id: string;
  description: string;
  fileSize: FileSize;
}

interface FileSize {
  value: number;
  unit: "KB" | "MB" | "GB" | "TB";
}

interface Dataset {
  datasetId: string;
  title: string;
  sequences: Sequence[];
  publicity: string;
}

interface ResearchDetails extends Omit<ResearchData, "subjects" | "datasets"> {
  summary: {
    purpose: string;
    methodology: string;
    subjects: string;
  };
  datasets: Dataset[];
  project: {
    representativeName: string;
    affiliation: string;
    projectName: string;
    subsidy: string;
  };
  publications: Publication[];
}

const researchDetails: ResearchDetails[] = [
  {
    researchId: "hum0469.v1",
    publicationDate: "2024/12/18",
    dataType: "NGS scRNA-seq",
    methodology: "発現",
    instrument: "MGI DNBSEQ-G400",
    title: "研究プロジェクト1",
    summary: {
      purpose:
        "免疫反応が関与する疾病（自己免疫及び難治性免疫疾患や、線維化を伴う疾患、がんなど）について、体内の生体反応や病態をより詳細に把握するため、血液及び組織標本を用いた経時的な変化と推移を追う。これにより、患者毎の多種多様なバックグラウンドや反応個体差に捉われずに、病態推移や薬剤副作用と深く関連するメカニズムや細胞などを見出せると期待する。本研究では、何らかの機能既知の分子に着目した測定や解析から始めるのではなく、網羅的なパラメータの取得によりプロファイリングすることで病態や治療と関連する因子を探索する。その後、見出された分子の変動確認や機能探索などを通じ、病態理解と治療法の開発に繋げる。",
      methodology:
        "single cell CITE-seq（Cellular indexing of transcriptomes and epitopes）、BD Ab-seq",
      subjects:
        "顕微鏡的多発血管炎（microscopic polyangiitis：MPA）、全身性強皮症（Systemic sclerosis : SSc）、健常者",
    },
    datasets: [
      {
        datasetId: "E-GEAD-635",
        publicity: "public",
        title: "データセット1",
        sequences: [
          {
            id: "CITE-seq",
            description:
              "顕微鏡的多発血管炎（ICD10：M31.7）：8症例内、3症例は2時点採取、5症例は1時点採取健常者：7名",
            fileSize: { value: 1024, unit: "MB" },
          },
        ],
      },
      {
        datasetId: "DRA019233",
        publicity: "NGS　非制限公開",
        title: "データセット2",
        sequences: [
          {
            id: "BD Ab-seq",
            description:
              "顕微鏡的多発血管炎（ICD10：M31.7）：6症例（内、4症例はE-GEAD-635と重複）健常者：7名（内、5症例はE-GEAD-635と重複、2症例はDRA019274 / E-GEAD-872と重複）",
            fileSize: { value: 1024, unit: "MB" },
          },
        ],
      },
      {
        datasetId: "DRA019274",
        publicity: "NGS　非制限公開",
        title: "データセット3",
        sequences: [
          {
            id: "CITE-seq",
            description:
              "全身性強皮症（ICD10：M34）：21症例内、1症例は3時点採取健常者：6名（内、3症例はE-GEAD-635と重複）",
            fileSize: { value: 10.4, unit: "MB" },
          },
          {
            id: "BD Ab-seq",
            description: "腎クリーゼ発症全身性強皮症（ICD10：M34）：1症例",
            fileSize: { value: 10, unit: "GB" },
          },
        ],
      },
    ],
    project: {
      representativeName: "山田 太郎",
      affiliation: "国立研究開発法人 国立研究開発法人 国立研究開発法人",
      projectName: "研究プロジェクト1",
      subsidy: "科研費",
    },
    publications: [
      {
        title: "Publication 1",
        DOI: "10.1234/5678",
        datasetIDs: ["E-GEAD-635", "DRA019233"],
      },
    ],
  },
  {
    researchId: "hum0433.v1",
    publicationDate: "2024/11/29",
    dataType: "NGS WGS",
    methodology: "配列決定",
    instrument: "MGI DNBSEQ-G400",
    title: "研究プロジェクト2",
    summary: {
      purpose:
        " 免疫反応が関与する疾病（自己免疫及び難治性免疫疾患や、線維化を伴う疾患、がんなど）について、体内の生体反応や病態をより詳細に把握するため、血液及び組織標本を用いた経時的な変化と推移を追う。これにより、患者毎の多種多様なバックグラウンドや反応個体差に捉われずに、病態推移や薬剤副作用と深く関連するメカニズムや細胞などを見出せると期待する。本研究では、何らかの機能既知の分子に着目した測定や解析から始めるのではなく、網羅的なパラメータの取得によりプロファイリングすることで病態や治療と関連する因子を探索する。その後、見出された分子の変動確認や機能探索などを通じ、病態理解と治療法の開発に繋げる。",
      methodology:
        "single cell CITE-seq（Cellular indexing of transcriptomes and epitopes）、BD Ab-seq",
      subjects:
        "顕微鏡的多発血管炎（microscopic polyangiitis：MPA）、全身性強皮症（Systemic sclerosis : SSc）、健常者",
    },
    datasets: [
      {
        datasetId: "DS2",
        title: "データセット2",
        publicity: "NGS　非制限公開",
        sequences: [
          {
            id: "SEQ1",
            description: "シーケンス1の詳細",
            fileSize: { value: 3.5, unit: "GB" },
          },
          {
            id: "SEQ2",
            description: "シーケンス2の詳細",
            fileSize: { value: 34, unit: "MB" },
          },
        ],
      },
    ],
    project: {
      projectName: "研究プロジェクト2",
      representativeName: "山田 太郎",
      affiliation: "国立研究開発法人 国立研究開発法人 国立研究開発法人",
      subsidy: "科研費",
    },
    publications: [
      {
        title: "Publication 2",
        DOI: "10.1234/5678",
        datasetIDs: ["DS2"],
      },
      {
        title: "Publication 3",
        DOI: "10.1234/5678",
        datasetIDs: ["DS2", "DS3"],
      },
    ],
  },
];

type DataUsers = {
  representativeName: string;
  affiliation: string;
  country: string;
  researchTitle: string;

  usagePeriod: [string, string];
  usedDatasetIds: string[];
};

const dataUsers: DataUsers[] = [
  {
    representativeName: "山田 太郎",
    affiliation: "国立研究開発法人 国立研究開発法人 国立研究開発法人",
    country: "日本",
    researchTitle: "研究プロジェクト1",
    usagePeriod: ["2024/12/18", "2025/12/18"],
    usedDatasetIds: ["E-GEAD-635", "DRA019233"],
  },
  {
    representativeName: "藤原 健太",
    affiliation: "大正製薬株式会社 セルフメディケーション研究開発企画部",
    country: "日本",
    researchTitle: "SIP 観察研究データを用いた不調解析",
    usagePeriod: ["2024/07/11", "2025/03/31"],
    usedDatasetIds: ["E-GEAD-635", "DS3"],
  },
  {
    representativeName: "佐藤 一郎",
    affiliation: "国立研究開発法人 国立研究開発法人 国立研究開発法人",
    country: "日本",
    researchTitle: "研究プロジェクト2",
    usagePeriod: ["2024/11/29", "2025/11/29"],
    usedDatasetIds: ["DRA019233", "DS2"],
  },
];

function RouteComponent() {
  const params = Route.useParams();

  const research = useMemo(() => {
    return researchDetails.find(
      (researchDetail) =>
        researchDetail.researchId.split(".")[0] === params.researchId
    );
  }, [params.researchId]);

  const dataUsedBy = useMemo(() => {
    if (!research) return [];
    const res = dataUsers.filter((dataUser) =>
      dataUser.usedDatasetIds.some((datasetId) =>
        research.datasets
          .map((dataset) => dataset.datasetId)
          .includes(datasetId)
      )
    );

    // leave only datasetIDs that are in this research
    res.forEach((dataUser) => {
      dataUser.usedDatasetIds = dataUser.usedDatasetIds.filter((datasetId) =>
        research.datasets
          .map((dataset) => dataset.datasetId)
          .includes(datasetId)
      );
    });

    return res;
  }, [research]);

  return (
    <CardWithCaption
      size={"lg"}
      variant={"dark"}
      caption={
        <div className="flex items-end gap-4">
          <div>
            <span className="text-xs">NDBC Research ID:</span>

            <h2 className="text-2xl leading-8">
              {FA_ICONS.books}
              <span className="ml-1">
                {params.researchId}.{params.researchVer}
              </span>
            </h2>
          </div>
          <Badge> リリース情報 </Badge>
        </div>
      }
    >
      <article className="mb-4">
        <h2 className="text-secondary mb-2 text-2xl font-semibold">研究概要</h2>
        <div className="columns-2 [&>p]:mb-2 [&>p>span]:font-bold">
          <p>
            <span>目的:</span>
            {research?.summary.purpose}
          </p>
          <p>
            <span>方法:</span>
            {research?.summary.methodology}
          </p>
          <p>
            <span>対象:</span>
            {research?.summary.subjects}
          </p>
        </div>
      </article>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <h2 className="text-secondary mb-2 text-2xl font-semibold">
          データセット
        </h2>
        <ul>
          {research?.datasets.map((dataset) => (
            <li key={dataset.datasetId} className="mb-2">
              <DatasetCard dataset={dataset} />
            </li>
          ))}
        </ul>
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <h2 className="text-secondary mb-2 text-2xl font-semibold">
          提供者情報
        </h2>
        <dl className="columns-2">
          <KeyValueCard
            title="代表者"
            value={research?.project.representativeName}
          />
          <hr className="border-foreground-light my-2 border" />
          <KeyValueCard
            title="所属機関"
            value={research?.project.affiliation}
          />
          <hr className="border-foreground-light my-2 border" />
          <KeyValueCard
            title="プロジェクト/研究グループ名"
            value={research?.project.projectName}
          />
          <hr className="border-foreground-light my-2 border" />
          <KeyValueCard
            title="科研費/助成金（Research Project Number）"
            value={research?.project.subsidy}
          />
          <hr className="border-foreground-light my-2 border" />
        </dl>
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />

      <section>
        <h2 className="text-secondary mb-2 text-2xl font-semibold">関連論文</h2>
        <Table
          columns={publicationColumns}
          data={research?.publications || []}
          className="mt-4"
        />
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <h2 className="text-secondary mb-2 text-2xl font-semibold">
          制限公開データの利用者一覧
        </h2>
        <Table columns={dataUsedByColumns} data={dataUsedBy}></Table>
      </section>
    </CardWithCaption>
  );
}

type Publication = {
  title: string;
  DOI: string;
  datasetIDs: string[];
};

const publicationsColumnHelper = createColumnHelper<Publication>();

const publicationColumns = [
  publicationsColumnHelper.accessor("title", {
    id: "title",
    header: "タイトル",
    cell: (info) => info.getValue(),
  }),
  publicationsColumnHelper.accessor("DOI", {
    id: "DOI",
    header: "DOI",
    cell: (info) => info.getValue(),
  }),
  publicationsColumnHelper.accessor("datasetIDs", {
    id: "datasetIDs",
    header: "データセット",
    cell: (info) => (
      <ul>
        {info.getValue().map((datasetId) => (
          <li key={datasetId}>
            <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
              {datasetId}
            </TextWithIcon>
          </li>
        ))}
      </ul>
    ),
  }),
];

const dataUsedByColumnsHelper = createColumnHelper<DataUsers>();

const dataUsedByColumns = [
  dataUsedByColumnsHelper.accessor("representativeName", {
    id: "representativeName",
    header: "利用者",
    cell: (info) => info.getValue(),
  }),
  dataUsedByColumnsHelper.accessor("affiliation", {
    id: "affiliation",
    header: "所属",
    cell: (info) => info.getValue(),
  }),
  dataUsedByColumnsHelper.accessor("country", {
    id: "country",
    header: "国・州名",
    cell: (info) => info.getValue(),
  }),
  dataUsedByColumnsHelper.accessor("researchTitle", {
    id: "researchTitle",
    header: "研究タイトル",
    cell: (info) => info.getValue(),
  }),

  dataUsedByColumnsHelper.accessor("usedDatasetIds", {
    id: "usedDatasetIds",
    header: "利用データセット",
    cell: (info) => (
      <ul>
        {info.getValue().map((datasetId) => (
          <li key={datasetId}>
            <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
              {datasetId}
            </TextWithIcon>
          </li>
        ))}
      </ul>
    ),
  }),
  dataUsedByColumnsHelper.accessor("usagePeriod", {
    id: "usagePeriod",
    header: "利用期間",
    cell: (info) => info.getValue().join(" - "),
  }),
];

type DatasetCaptionProps = Pick<Dataset, "datasetId" | "publicity">;

function DatasetCaption({ datasetId, publicity }: DatasetCaptionProps) {
  return (
    <div className="flex justify-between">
      <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
      <div>{publicity}</div>
    </div>
  );
}

function DatasetCard({ dataset }: { dataset: Dataset }) {
  return (
    <CardWithCaption
      caption={
        <DatasetCaption
          datasetId={dataset.datasetId}
          publicity={dataset.publicity}
        />
      }
      className="border-foreground-light border"
    >
      <ul>
        {dataset.sequences.map((sequence, index) => (
          <li key={sequence.id}>
            <div className="flex justify-between text-sm">
              <div className="text-secondary font-bold">{sequence.id}</div>
              <div>
                {sequence.fileSize.value} {sequence.fileSize.unit}
              </div>
            </div>
            {sequence.description}
            {index < dataset.sequences.length - 1 && (
              <hr className="border-foreground-light -mx-2 my-2 border-dashed" />
            )}
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function KeyValueCard({ title, value }: { title: string; value?: string }) {
  return (
    <>
      <dt className="text-secondary">{title}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white/20 px-2 py-1 text-xs text-white">
      {children}
    </span>
  );
}
