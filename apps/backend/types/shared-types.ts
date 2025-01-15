export interface APIResponse {
  message: string
}


// === 現状の front から想像した型定義 ===

interface Research {
  // === from home table ===
  humId: string // e.g., hum0001.v1
  researchId: string // or dataId?, e.g., JGAS000002
  title: string // e.g., A 罹患患者のゲノム解析データ
  releaseDate: string // e.g., 2021-01-01
  dataType: string // e.g., WGS
  researchMethod: string // e.g., PCR, NGS (WGS, RNA-seq), etc.
  technology: string // or technique?, e.g., Illumina, PacBio, etc.
  participants: string // e.g., 50 検体 (細胞株)
  provider: Provider // or researcher?, e.g., A さん
  accessRestriction: string // e.g., 制限 (Type1)

  // === from detail page ===
  purpose: string // 目的
  method: string // 方法
  target: string // 対象
  url: string
  datasets: Dataset[]

  restrictedDataUsers: DataUser[] // 制限公開データの利用者
}

interface Dataset {
  datasetId: string // 独自定義する, 下の dataId がない場合があるから、それを補完するため
  dataId: string // いい名前が思いつかない (draId or jgaId) , DRA001273 とかもともと振られている ID

  // === from detail page ===
  draId: string // DRA ID
  jgaId: string // JGA ID
  target: string // 対象
  targetRegion: string // 対象領域
  librarySource: string // ライブラリソース
  sampleInfo: string | null // 検体情報
  libraryPreparationKit: string | null // ライブラリ作製方法
  fragmentationMethod: string | null // 断片化方法
  libraryConstructionMethod: string | null // ライブラリ構築方法
  readLength: string // リード長
  totalDataSize: string // 総データ量

  relatedPublication: Publication[]
}

interface Provider {
  principalInvestigator: string // 研究代表者
  affiliation: string // 所属機関
  researchGrant: ResearchGrant[] // 科研費/助成金
}

interface ResearchGrant {
  grantId: string // 科研費/助成金番号, 研究課題番号?
  grantName: string // 科研費/助成金名
  title: string // 研究題目
}

interface Publication {
  title: string
  doi: string
}

interface DataUser {
  name: string // 研究代表者
  affiliation: string // 所属機関
  country: string // 国・州名
  researchTitle: string // 研究題目
  datasetId: string[] // 利用データ ID
  period: string // 利用期間
}












// === 以下の型定義は、https://github.com/dbcls/humandbs/tree/dev の json より ===
interface Dataset {
  alias: string
  center_name: string
  accession: string
  submission_date: string
  IDENTIFIERS: Identifiers
  TITLE: string
  DESCRIPTION: string
  DATASET_TYPE: string
  POLICY_REF: PolicyReference
  DATA_REF: DataReference[]
  ANALYSIS_REF: AnalysisReference
  dateCreated: string
  datePublished: string
  dateModified: string
  samples: Samples
}

interface Identifiers {
  SECONDARY_ID: string
}

interface PolicyReference {
  refname: string
  refcenter: string
  accession: string
}

interface DataReference {
  refname: string
  refcenter: string
  accession: string
}

interface AnalysisReference {
  refname: string
  refcenter: string
  accession: string
}

interface Samples {
  id: string
  dbXrefsStatistics: DbXrefStatistic[]
  attribute: Attribute[]
}

interface DbXrefStatistic {
  type: string
  count: number
}

interface Attribute {
  name: string
  value: string
  count: number
}
