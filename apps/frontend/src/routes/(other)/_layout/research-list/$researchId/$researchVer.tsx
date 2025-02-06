import { createFileRoute } from "@tanstack/react-router"

import { CardWithCaption } from "@/components/Card"
import { TextWithIcon } from "@/components/TextWithIcon"
import { FA_ICONS } from "@/lib/faIcons"

import { ResearchData } from "../index.lazy"

export const Route = createFileRoute(
  "/(other)/_layout/research-list/$researchId/$researchVer",
)({
  component: RouteComponent,

})

interface Sequence {
  id: string,
  description: string,
  fileSize: FileSize
}

interface FileSize {

  value: number,
  unit: "KB" | "MB" | "GB" | "TB"
}

interface Dataset {
  datasetId: string;
  title: string;
  sequences: Sequence[];
  publicity: string

}

interface ResearchDetails extends Omit<ResearchData, "subjects" | "datasets"> {
  summary: {
    purpose: string;
    methodology: string;
    subjects: string;
  },
  datasets: Dataset[]
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
      purpose: "免疫反応が関与する疾病（自己免疫及び難治性免疫疾患や、線維化を伴う疾患、がんなど）について、体内の生体反応や病態をより詳細に把握するため、血液及び組織標本を用いた経時的な変化と推移を追う。これにより、患者毎の多種多様なバックグラウンドや反応個体差に捉われずに、病態推移や薬剤副作用と深く関連するメカニズムや細胞などを見出せると期待する。本研究では、何らかの機能既知の分子に着目した測定や解析から始めるのではなく、網羅的なパラメータの取得によりプロファイリングすることで病態や治療と関連する因子を探索する。その後、見出された分子の変動確認や機能探索などを通じ、病態理解と治療法の開発に繋げる。",
      methodology: "single cell CITE-seq（Cellular indexing of transcriptomes and epitopes）、BD Ab-seq",
      subjects: "顕微鏡的多発血管炎（microscopic polyangiitis：MPA）、全身性強皮症（Systemic sclerosis : SSc）、健常者",
    },
    datasets: [
      {
        datasetId: "E-GEAD-635",
        publicity: "public",
        title: "データセット1",
        sequences: [
          { id: "CITE-seq", description: "顕微鏡的多発血管炎（ICD10：M31.7）：8症例内、3症例は2時点採取、5症例は1時点採取健常者：7名", fileSize: { value: 1024, unit: "MB" } },
        ],
      },
      {
        datasetId: "DRA019233",
        publicity: "NGS　非制限公開",
        title: "データセット2",
        sequences: [
          { id: "BD Ab-seq", description: "顕微鏡的多発血管炎（ICD10：M31.7）：6症例（内、4症例はE-GEAD-635と重複）健常者：7名（内、5症例はE-GEAD-635と重複、2症例はDRA019274 / E-GEAD-872と重複）", fileSize: { value: 1024, unit: "MB" } },
        ],

      },
      {
        datasetId: "DRA019274",
        publicity: "NGS　非制限公開",
        title: "データセット3",
        sequences: [
          { id: "CITE-seq", description: "全身性強皮症（ICD10：M34）：21症例内、1症例は3時点採取健常者：6名（内、3症例はE-GEAD-635と重複）", fileSize: { value: 10.4, unit: "MB" } },
          { id: "BD Ab-seq", description: "腎クリーゼ発症全身性強皮症（ICD10：M34）：1症例", fileSize: { value: 10, unit: "GB" } },
        ],
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
      purpose: "この研究は新しい治療法の開発を目指しています。",
      methodology: "臨床試験とデータ解析を組み合わせた手法。",
      subjects: "患者グループA",
    },
    datasets: [
      {
        datasetId: "DS2",
        title: "データセット2",
        publicity: "NGS　非制限公開",
        sequences: [
          { id: "SEQ1", description: "シーケンス1の詳細", fileSize: { value: 3.5, unit: "GB" } },
          { id: "SEQ2", description: "シーケンス2の詳細", fileSize: { value: 34, unit: "MB" } },
        ],
      },
    ],
  },
]

type DatasetCaptionProps = Pick<Dataset, "datasetId" | "publicity">

function DatasetCaption({ datasetId, publicity }: DatasetCaptionProps) {

  return <div className=" flex justify-between"><TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon><div>{publicity}</div></div>
}

function DatasetCard({ dataset }: { dataset: Dataset }) {

  return <CardWithCaption caption={<DatasetCaption datasetId={dataset.datasetId} publicity={dataset.publicity} />}>
    {dataset.sequences.map((sequence) => <div>{sequence.id} {sequence.description} {sequence.fileSize.value} {sequence.fileSize.unit}</div>)}
  </CardWithCaption>
}

function RouteComponent() {

  const params = Route.useParams()
  return (
    <CardWithCaption size={"lg"} variant={"dark"} caption={<h2> title</h2>}>
      hello research ID {params.researchId} ver {params.researchVer}
      {researchDetails[0].datasets.map((dataset) => <DatasetCard dataset={dataset} />)}
    </CardWithCaption>
  )
}
