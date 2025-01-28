export interface APIResponse {
  message: string
}


// === 現状の front から想像した型定義 ===

// GET /researches -> ResearchVersion[]
// GET /researches/<researchId>/version -> ResearchVersion
interface ResearchVersion {
  baseResearchId: string // "hum0001"
  version: string[] // e.g., ["hum0001.v1", "hum0001.v2", "hum0001.v3"]
  // TODO: 日付情報とかも含めるか？(front の version table の描画にあると便利)
  // TODO: `hum0001.v1` OR `v1` のどちらをするか？version の記法って固定されているのか？
}

// GET /researches/<researchId> -> Research
interface Research {
  researchId: string // e.g., hum0001.v1
  title: string // data source が見つからない
  dataset: Dataset[]
  summary: Summary
  molecularData: MoleculerData[]
  dataProvider: DataProvider[]
  publication: Publication[]
  releaseNote: ReleaseNote


  // releaseDate: string // e.g., 2021-01-01
  // dataType: string // e.g., WGS
  // researchMethod: string // e.g., PCR, NGS (WGS, RNA-seq), etc.
  // // jaResearchMethod
  // technology: string // or technique?, e.g., Illumina, PacBio, etc.
  // participants: string // e.g., 50 検体 (細胞株)
  // provider: Provider // or researcher?, e.g., A さん
  // accessRestriction: string // e.g., 制限 (Type1)


  // restrictedDataUsers: DataUser[] // 制限公開データの利用者
}

interface Summary {
  aim: string // 目的
  method: string // 方法
  target: string // 対象
}

interface MoleculerData {
  // "Participants/Materials": "3980 POAG patients (Male: 1,997, Female: 1,983)\r\n18,815 controls (Male: 7,817, Female: 10,998)",
  // "Targets": "genome wide SNVs",
  // "Target Loci for Capture Methods": "-",
  // "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  // "Source": "gDNA extracted from peripheral blood cells",
  // "Cell Lines": "-",
  // "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  // "Genotype Call Methods (software)": "minimac（ver. 0.1.1） [imputation (1000 genomes Phase I v3)]",
  // "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel: After excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded. \r\nQC after imputation: Variants with imputation quality of Rsq < 0.7 were excluded. We also excluded variants with |beta| > 4 in the uploaded files.",
  // "Marker Number (after QC)": "autosomes: 5,961,428 SNPs (hg19)\r\nmale X-chromosome: 147,351 SNPs (hg19)\r\nfemale X-chromosome: 147,353 SNPs (hg19)",
  // "NBDC Dataset ID": "hum0014.v7.POAG.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  // "Total Data Volume": "113 MB (txt.zip)",
  // "Comments (Policies)": "NBDC policy",
}

interface ReleaseNote {
  releaseDate: string // e.g., 2023/11/01
  typeOfData: string // e.g., WGS, TODO: これはどういう意味？
  description: string // e.g., "This is a release note."
}


// interface Dataset {
//   datasetId: string // 独自定義する, 下の dataId がない場合があるから、それを補完するため

//   // 外部の DB の ID のこと
//   extDatabaseId: string // いい名前が思いつかない (draId or jgaId) , DRA001273 とかもともと振られている ID




//   // === from detail page ===
//   draId: string // DRA ID
//   jgaId: string // JGA ID
//   target: string // 対象
//   targetRegion: string // 対象領域
//   librarySource: string // ライブラリソース
//   sampleInfo: string | null // 検体情報
//   libraryPreparationKit: string | null // ライブラリ作製方法
//   fragmentationMethod: string | null // 断片化方法
//   libraryConstructionMethod: string | null // ライブラリ構築方法
//   readLength: string // リード長
//   totalDataSize: string // 総データ量

//   relatedPublication: Publication[]
// }

// // Dataset と MoleculerData の 1 対 1? 1 対 多? n 対 n? とかは決まってない。。。

// interface MoleculerData {
//   //
// }


// interface Provider {
//   principalInvestigator: string // 研究代表者
//   affiliation: string // 所属機関
//   researchGrant: ResearchGrant[] // 科研費/助成金
// }

// // BioProject の Study Object などを参考にするのがよい
// interface ResearchGrant {
//   grantId: string // 科研費/助成金番号, 研究課題番号?
//   grantName: string // 科研費/助成金名
//   title: string // 研究題目
// }

// interface Publication {
//   title: string
//   doi: string
// }

// interface DataUser {
//   name: string // 研究代表者
//   affiliation: string // 所属機関
//   country: string // 国・州名
//   researchTitle: string // 研究題目
//   datasetId: string[] // 利用データ ID
//   period: string // 利用期間
// }
