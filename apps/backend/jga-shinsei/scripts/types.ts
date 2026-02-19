/**
 * JGA 申請データの型定義
 *
 * - Input types: DB ダンプ JSON の構造（snake_case）
 * - Output types: 変換後の API フレンドリーな構造（camelCase）
 */

// =============================================================================
// Union types
// =============================================================================

/** 申請ステータスコード (10 から 80 まで 10 刻み) */
export type StatusCode = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80

/** 表示言語 */
export type Lang = "ja" | "en"

/** 二択 (はい/いいえ) の選択値。多くのステータス系フィールドで使用 */
export type YesNo = "yes" | "no"

/** データ公開種別 (J-DS) */
export type DataAccess =
  | "submission_open"
  | "submission_type1"
  | "submission_type2"

/** データ解析サーバーの設置場所 (J-DU) */
export type ServerLocation = "onpre" | "offpre" | "both"

/** オフプレミス解析サーバー (J-DU) */
export type OffPremiseServer = "nig" | "tombo" | "hgc" | "kog"

/** 倫理審査ステータス (J-DU) */
export type UseReviewStatus = "completed" | "notyet" | "unnecessary"

// =============================================================================
// Input types
// =============================================================================

/** EAV (Entity-Attribute-Value) パターンの 1 行。`nbdc_application_component` テーブル由来 */
export interface Component {
  key: string // コンポーネントキー名 (例: "aim", "pi_first_name")
  value: string
}

/** DB 由来のステータス履歴エントリ */
export interface RawStatusHistoryEntry {
  status: number
  date: string // ISO 8601 datetime
}

/** DB 由来の申請メタデータ */
export interface RawApplication {
  study_title: string | null // 研究題目 (日本語)
  study_title_en: string | null // 研究題目 (英語)
  pi: {
    // components にもより詳細な情報があるが、create_date 取得用に使用
    last_name: string | null
    first_name: string | null
    last_name_en: string | null
    first_name_en: string | null
    institution: string | null
    institution_en: string | null
    division: string | null
    division_en: string | null
  }
  create_date: string // ISO 8601。変換後 `createDate` になる
}

/** DB 由来の J-DS (データ提供申請) レコード */
export interface RawDsApplication {
  jds_id: string // "J-DS002495"
  jsub_ids: string[]
  hum_ids: string[] // ["hum0273"]
  jga_ids: string[] // ["JGA000442"]
  application: RawApplication
  components: Component[] // EAV コンポーネント配列。変換の主要入力
  status_history: RawStatusHistoryEntry[]
  submit_date: string // ISO 8601
}

/** DB 由来の J-DU (データ利用申請) レコード */
export interface RawDuApplication {
  jdu_id: string // "J-DU006529"
  jgad_ids: string[] // ["JGAD000369"]
  jgas_ids: string[] // ["JGAS000001"]
  hum_ids: string[]
  application: RawApplication
  components: Component[] // EAV コンポーネント配列。変換の主要入力
  status_history: RawStatusHistoryEntry[]
  submit_date: string // ISO 8601
}

// =============================================================================
// Output types - Common
// =============================================================================

/** 日英バイリンガルテキスト。component key の `_en` サフィックスペアから生成 */
export interface BilingualText {
  ja: string | null // 対応する component key がない場合は null
  en: string | null // 対応する component key がない場合は null
}

/** ステータス履歴エントリ (ラベル付き) */
export interface StatusHistoryEntry {
  status: StatusCode
  statusLabel: BilingualText
  date: string // ISO 8601
}

/** 住所。PI・Submitter の所属先住所 */
export interface Address {
  country: string | null // 例: "Japan"
  postalCode: string | null // 例: "000-0000"
  prefecture: string | null
  city: string | null
  street: string | null
}

/** 機関長情報 */
export interface Head {
  name: string | null
  job: string | null
  phone: string | null
  email: string | null
}

/** 研究責任者 (PI: Principal Investigator) */
export interface Pi {
  accountId: string | null // D-way アカウント ID
  firstName: BilingualText
  middleName: BilingualText // ja は常に null (component key が存在しない)
  lastName: BilingualText
  institution: BilingualText
  division: BilingualText
  job: BilingualText
  phone: string | null
  email: string | null
  address: Address
}

/** 申請提出者。PI と構造は同じだが、institution/division/middleName の ja は常に null */
export interface Submitter {
  accountId: string | null // D-way アカウント ID
  firstName: BilingualText
  middleName: BilingualText // ja は常に null
  lastName: BilingualText
  institution: BilingualText // ja は常に null (component key が存在しない)
  division: BilingualText // ja は常に null (component key が存在しない)
  job: BilingualText
  phone: string | null
  email: string | null
  address: Address
}

/** 研究分担者。multiValue グループから index 紐付けで生成 */
export interface Collaborator {
  name: string | null
  division: string | null
  job: string | null
  eradid: string | null // e-Rad 研究者番号
  orcid: string | null
  seminar: YesNo | null // NBDC セミナー受講状況
}

/** アップロード済みファイル。multiValue グループから index 紐付けで生成 */
export interface UploadedFile {
  file: string | null
  type: string | null // 例: "ethics_review"
}

/** 申請制御情報・メタデータ */
export interface Control {
  lang: Lang | null
  groupId: string | null // 例: "subgrp2116"
  isEditAccount: boolean | null
  isNoneCollaborator: boolean | null // 研究分担者なしフラグ
  privateComment: string | null // 担当者向けコメント (非公開)
  isDeclareStatement: boolean | null // 宣言同意フラグ
  isAgreeMailUse: boolean | null // メール利用同意フラグ
}

// =============================================================================
// Output types - J-DS (データ提供申請)
// =============================================================================

/** データセット記述。multiValue グループから index 紐付けで生成 */
export interface DataEntry {
  dataAccess: DataAccess | null
  studyType: string | null // 例: "study_type_wgs"。カンマ区切りで複数指定の場合あり
  studyTypeOther: string | null // 研究種別 (その他) の自由記述
  target: string | null
  fileFormat: string | null
  fileSize: string | null
}

/** 匿名化情報 */
export interface DeIdentification {
  status: string | null // 例: "completed"
  date: string | null
  reason: string | null // 匿名化できない理由
}

/** 倫理審査・ガイドライン関連情報 (J-DS) */
export interface Review {
  submissionStatus: string | null // 例: "completed"
  submissionDate: string | null
  companyUseStatus: string | null // 例: "ok"
  multicenterCollaborativeStudyStatus: "yes" | "no" | "piinstitution" | null
  nbdcDataProcessingStatus: string | null // 例: "ok"
  nbdcDataProcessingReason: string | null
  nbdcGuidelineStatus: YesNo | null
  isSimplifiedReview: boolean | null
}

/** J-DS (データ提供申請) 変換後データ */
export interface DsApplicationTransformed {
  jdsId: string // "J-DS002495"
  jsubIds: string[]
  humIds: string[]
  jgaIds: string[]
  studyTitle: BilingualText // submission_study_title / _en から生成
  aim: BilingualText
  method: BilingualText
  participant: BilingualText
  restriction: BilingualText
  publication: string | null // 例: "PMID:12345"
  icd10: string | null // 例: "C00-C97"
  data: DataEntry[] // multiValue グループ
  releaseDate: string | null // 例: "2024-12-28"
  deIdentification: DeIdentification
  review: Review
  head: Head
  pi: Pi
  submitter: Submitter
  collaborators: Collaborator[] // multiValue グループ
  uploadedFiles: UploadedFile[] // multiValue グループ
  control: Control
  statusHistory: StatusHistoryEntry[]
  submitDate: string // ISO 8601
  createDate: string // ISO 8601。application.create_date 由来
}

// =============================================================================
// Output types - J-DU (データ利用申請)
// =============================================================================

/** 利用申請データセット。multiValue グループから index 紐付けで生成 */
export interface UseDataset {
  request: string | null // リクエスト先データセット ID (例: "JGAD000369")
  purpose: string | null
  id: string | null // データセット ID (例: "JGAD000369")
}

/** データ利用期間 */
export interface UsePeriod {
  start: string | null // 例: "2024-12-01"
  end: string | null // 例: "2025-11-30"
}

/** 倫理審査情報 (J-DU) */
export interface UseReview {
  status: UseReviewStatus | null
  date: string | null
}

/** データ解析サーバー情報 (J-DU) */
export interface Server {
  status: ServerLocation | null
  offPremiseStatus: OffPremiseServer[] // multiValue (複数選択可)
  isOffPremiseStatement: boolean | null // オフプレミス利用の宣誓フラグ
  acknowledgmentStatus: YesNo | null
}

/** SSH 公開鍵情報 (J-DU)。データダウンロード用 */
export interface PublicKey {
  file: string | null // 公開鍵ファイル名
  txt: string | null // 公開鍵テキスト (テキスト入力)
  key: string | null // 公開鍵の値
}

/** 利用報告 (J-DU) */
export interface Report {
  summary: string | null
  publication: string | null
  intellectualProperty: string | null
  nbdcSharingGuidelineStatus: YesNo | null
  nbdcSharingGuidelineDetail: string | null
  newReportStatus: string | null
}

/** データ削除（終了）報告 (J-DU) */
export interface Deletion {
  date: string | null
  keepSecondaryDataStatus: YesNo | null
  keepSecondaryDataDetail: string | null
}

/** 加工データ配布情報 (J-DU) */
export interface Distribution {
  status: YesNo | null
  detail: string | null
  way: string | null // 配布方法
  isStatement1: boolean | null // 宣誓事項 1 の同意フラグ
  isStatement2: boolean | null // 宣誓事項 2 の同意フラグ
}

/** 研究グループメンバー (J-DU)。multiValue グループから index 紐付けで生成。全 BilingualText の ja は常に null */
export interface Member {
  accountId: string | null // D-way アカウント ID
  firstName: BilingualText // ja は常に null
  middleName: BilingualText // ja は常に null
  lastName: BilingualText // ja は常に null
  email: string | null
  institution: BilingualText // ja は常に null
  division: BilingualText // ja は常に null
  job: BilingualText // ja は常に null
  eradid: string | null // e-Rad 研究者番号
  orcid: string | null
}

/** J-DU (データ利用申請) 変換後データ */
export interface DuApplicationTransformed {
  jduId: string // "J-DU006529"
  jgadIds: string[]
  jgasIds: string[]
  humIds: string[]
  studyTitle: BilingualText // use_study_title / _en から生成
  usePurpose: string | null
  useSummary: string | null
  usePublication: string | null
  useDatasets: UseDataset[] // multiValue グループ
  usePeriod: UsePeriod
  useReview: UseReview
  server: Server
  publicKey: PublicKey
  report: Report
  deletion: Deletion
  distribution: Distribution
  members: Member[] // multiValue グループ
  head: Head
  pi: Pi
  submitter: Submitter
  collaborators: Collaborator[] // multiValue グループ
  uploadedFiles: UploadedFile[] // multiValue グループ
  control: Control
  statusHistory: StatusHistoryEntry[]
  submitDate: string // ISO 8601
  createDate: string // ISO 8601。application.create_date 由来
}
