/**
 * JGA 申請データの型定義
 *
 * - Input types: DB ダンプ JSON の構造（snake_case）- interface のまま
 * - Union types: z.enum() で定義
 * - Output types: 変換後の API フレンドリーな構造（camelCase）- Zod スキーマ
 */
import { z } from "zod"

// === Union types ===

/** 申請ステータスコード (10 から 80 まで 10 刻み) */
export const JgaStatusCodeSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(40),
  z.literal(50),
  z.literal(60),
  z.literal(70),
  z.literal(80),
])
export type StatusCode = z.infer<typeof JgaStatusCodeSchema>

/** 表示言語 */
export const LangSchema = z.enum(["ja", "en"])
export type Lang = z.infer<typeof LangSchema>

/** 二択 (はい/いいえ) の選択値 */
export const YesNoSchema = z.enum(["yes", "no"])
export type YesNo = z.infer<typeof YesNoSchema>

/** データ公開種別 (J-DS) */
export const DataAccessSchema = z.enum(["submission_open", "submission_type1", "submission_type2"])
export type DataAccess = z.infer<typeof DataAccessSchema>

/** データ解析サーバーの設置場所 (J-DU) */
export const ServerLocationSchema = z.enum(["onpre", "offpre", "both"])
export type ServerLocation = z.infer<typeof ServerLocationSchema>

/** オフプレミス解析サーバー (J-DU) */
export const OffPremiseServerSchema = z.enum(["nig", "tombo", "hgc", "kog"])
export type OffPremiseServer = z.infer<typeof OffPremiseServerSchema>

/** 倫理審査ステータス (J-DU) */
export const UseReviewStatusSchema = z.enum(["completed", "notyet", "unnecessary"])
export type UseReviewStatus = z.infer<typeof UseReviewStatusSchema>

// === Input types ===

/** EAV (Entity-Attribute-Value) パターンの 1 行。`nbdc_application_component` テーブル由来 */
export interface Component {
  key: string
  value: string
}

/** DB 由来のステータス履歴エントリ */
export interface RawStatusHistoryEntry {
  status: number
  date: string
}

/** DB 由来の J-DS (データ提供申請) レコード */
export interface RawDsApplication {
  jds_id: string
  jsub_ids: string[]
  hum_ids: string[]
  jga_ids: string[]
  components: Component[]
  status_history: RawStatusHistoryEntry[]
  submit_date: string
  create_date: string
}

/** DB 由来の J-DU (データ利用申請) レコード */
export interface RawDuApplication {
  jdu_id: string
  jgad_ids: string[]
  jgas_ids: string[]
  hum_ids: string[]
  components: Component[]
  status_history: RawStatusHistoryEntry[]
  submit_date: string
  create_date: string
}

// === Output types - Common ===

/** 日英バイリンガルテキスト */
export const JgaBilingualTextSchema = z.object({
  ja: z.string().nullable(),
  en: z.string().nullable(),
})
export type BilingualText = z.infer<typeof JgaBilingualTextSchema>

/** ステータス履歴エントリ (ラベル付き) */
export const StatusHistoryEntrySchema = z.object({
  status: JgaStatusCodeSchema,
  statusLabel: JgaBilingualTextSchema,
  date: z.string(),
})
export type StatusHistoryEntry = z.infer<typeof StatusHistoryEntrySchema>

/** 住所 */
export const AddressSchema = z.object({
  country: z.string().nullable(),
  postalCode: z.string().nullable(),
  prefecture: z.string().nullable(),
  city: z.string().nullable(),
  street: z.string().nullable(),
})
export type Address = z.infer<typeof AddressSchema>

/** 機関長情報 */
export const HeadSchema = z.object({
  name: z.string().nullable(),
  job: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
})
export type Head = z.infer<typeof HeadSchema>

/** 研究責任者 (PI: Principal Investigator) */
export const PiSchema = z.object({
  accountId: z.string().nullable(),
  firstName: JgaBilingualTextSchema,
  middleName: JgaBilingualTextSchema,
  lastName: JgaBilingualTextSchema,
  institution: JgaBilingualTextSchema,
  division: JgaBilingualTextSchema,
  job: JgaBilingualTextSchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: AddressSchema,
})
export type Pi = z.infer<typeof PiSchema>

/** 申請提出者 */
export const SubmitterSchema = z.object({
  accountId: z.string().nullable(),
  firstName: JgaBilingualTextSchema,
  middleName: JgaBilingualTextSchema,
  lastName: JgaBilingualTextSchema,
  institution: JgaBilingualTextSchema,
  division: JgaBilingualTextSchema,
  job: JgaBilingualTextSchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: AddressSchema,
})
export type Submitter = z.infer<typeof SubmitterSchema>

/** 研究分担者 */
export const CollaboratorSchema = z.object({
  name: z.string().nullable(),
  division: z.string().nullable(),
  job: z.string().nullable(),
  eradid: z.string().nullable(),
  orcid: z.string().nullable(),
  seminar: YesNoSchema.nullable(),
})
export type Collaborator = z.infer<typeof CollaboratorSchema>

/** アップロード済みファイル */
export const UploadedFileSchema = z.object({
  file: z.string().nullable(),
  type: z.string().nullable(),
})
export type UploadedFile = z.infer<typeof UploadedFileSchema>

/** 申請制御情報・メタデータ */
export const ControlSchema = z.object({
  lang: LangSchema.nullable(),
  groupId: z.string().nullable(),
  isNoneCollaborator: z.boolean().nullable(),
  privateComment: z.string().nullable(),
  isDeclareStatement: z.boolean().nullable(),
  isAgreeMailUse: z.boolean().nullable(),
})
export type Control = z.infer<typeof ControlSchema>

// === Output types - J-DS (データ提供申請) ===

/** データセット記述 */
export const DataEntrySchema = z.object({
  dataAccess: DataAccessSchema.nullable(),
  studyType: z.string().nullable(),
  studyTypeOther: z.string().nullable(),
  target: z.string().nullable(),
  fileFormat: z.string().nullable(),
  fileSize: z.string().nullable(),
})
export type DataEntry = z.infer<typeof DataEntrySchema>

/** 匿名化情報 */
export const DeIdentificationSchema = z.object({
  status: z.string().nullable(),
  date: z.string().nullable(),
  reason: z.string().nullable(),
})
export type DeIdentification = z.infer<typeof DeIdentificationSchema>

/** 倫理審査・ガイドライン関連情報 (J-DS) */
export const ReviewSchema = z.object({
  submissionStatus: z.string().nullable(),
  submissionDate: z.string().nullable(),
  companyUseStatus: z.string().nullable(),
  multicenterCollaborativeStudyStatus: z.union([
    z.literal("yes"),
    z.literal("no"),
    z.literal("piinstitution"),
  ]).nullable(),
  nbdcDataProcessingStatus: z.string().nullable(),
  nbdcDataProcessingReason: z.string().nullable(),
  nbdcGuidelineStatus: YesNoSchema.nullable(),
  isSimplifiedReview: z.boolean().nullable(),
})
export type Review = z.infer<typeof ReviewSchema>

/** J-DS (データ提供申請) 変換後データ */
export const DsApplicationTransformedSchema = z.object({
  jdsId: z.string(),
  jsubIds: z.array(z.string()),
  humIds: z.array(z.string()),
  jgaIds: z.array(z.string()),
  studyTitle: JgaBilingualTextSchema,
  aim: JgaBilingualTextSchema,
  method: JgaBilingualTextSchema,
  participant: JgaBilingualTextSchema,
  restriction: JgaBilingualTextSchema,
  publication: z.string().nullable(),
  icd10: z.string().nullable(),
  data: z.array(DataEntrySchema),
  releaseDate: z.string().nullable(),
  deIdentification: DeIdentificationSchema,
  review: ReviewSchema,
  head: HeadSchema,
  pi: PiSchema,
  submitter: SubmitterSchema,
  collaborators: z.array(CollaboratorSchema),
  uploadedFiles: z.array(UploadedFileSchema),
  control: ControlSchema,
  statusHistory: z.array(StatusHistoryEntrySchema),
  submitDate: z.string(),
  createDate: z.string(),
})
export type DsApplicationTransformed = z.infer<typeof DsApplicationTransformedSchema>

// === Output types - J-DU (データ利用申請) ===

/** 利用申請データセット */
export const UseDatasetSchema = z.object({
  request: z.string().nullable(),
  purpose: z.string().nullable(),
  id: z.string().nullable(),
})
export type UseDataset = z.infer<typeof UseDatasetSchema>

/** データ利用期間 */
export const UsePeriodSchema = z.object({
  start: z.string().nullable(),
  end: z.string().nullable(),
})
export type UsePeriod = z.infer<typeof UsePeriodSchema>

/** 倫理審査情報 (J-DU) */
export const UseReviewSchema = z.object({
  status: UseReviewStatusSchema.nullable(),
  date: z.string().nullable(),
})
export type UseReview = z.infer<typeof UseReviewSchema>

/** データ解析サーバー情報 (J-DU) */
export const ServerSchema = z.object({
  status: ServerLocationSchema.nullable(),
  offPremiseStatus: z.array(OffPremiseServerSchema),
  isOffPremiseStatement: z.boolean().nullable(),
  acknowledgmentStatus: YesNoSchema.nullable(),
})
export type Server = z.infer<typeof ServerSchema>

/** SSH 公開鍵情報 (J-DU) */
export const PublicKeySchema = z.object({
  file: z.string().nullable(),
  txt: z.string().nullable(),
  key: z.string().nullable(),
})
export type PublicKey = z.infer<typeof PublicKeySchema>

/** 利用報告 (J-DU) */
export const ReportSchema = z.object({
  summary: z.string().nullable(),
  publication: z.string().nullable(),
  intellectualProperty: z.string().nullable(),
  nbdcSharingGuidelineStatus: YesNoSchema.nullable(),
  nbdcSharingGuidelineDetail: z.string().nullable(),
  newReportStatus: z.string().nullable(),
})
export type Report = z.infer<typeof ReportSchema>

/** データ削除（終了）報告 (J-DU) */
export const DeletionSchema = z.object({
  date: z.string().nullable(),
  keepSecondaryDataStatus: YesNoSchema.nullable(),
  keepSecondaryDataDetail: z.string().nullable(),
})
export type Deletion = z.infer<typeof DeletionSchema>

/** 加工データ配布情報 (J-DU) */
export const DistributionSchema = z.object({
  status: YesNoSchema.nullable(),
  detail: z.string().nullable(),
  way: z.string().nullable(),
  isStatement1: z.boolean().nullable(),
  isStatement2: z.boolean().nullable(),
})
export type Distribution = z.infer<typeof DistributionSchema>

/** 研究グループメンバー (J-DU) */
export const MemberSchema = z.object({
  accountId: z.string().nullable(),
  firstName: JgaBilingualTextSchema,
  middleName: JgaBilingualTextSchema,
  lastName: JgaBilingualTextSchema,
  email: z.string().nullable(),
  institution: JgaBilingualTextSchema,
  division: JgaBilingualTextSchema,
  job: JgaBilingualTextSchema,
  eradid: z.string().nullable(),
  orcid: z.string().nullable(),
})
export type Member = z.infer<typeof MemberSchema>

/** J-DU (データ利用申請) 変換後データ */
export const DuApplicationTransformedSchema = z.object({
  jduId: z.string(),
  jgadIds: z.array(z.string()),
  jgasIds: z.array(z.string()),
  humIds: z.array(z.string()),
  studyTitle: JgaBilingualTextSchema,
  usePurpose: z.string().nullable(),
  useSummary: z.string().nullable(),
  usePublication: z.string().nullable(),
  useDatasets: z.array(UseDatasetSchema),
  usePeriod: UsePeriodSchema,
  useReview: UseReviewSchema,
  server: ServerSchema,
  publicKey: PublicKeySchema,
  report: ReportSchema,
  deletion: DeletionSchema,
  distribution: DistributionSchema,
  members: z.array(MemberSchema),
  head: HeadSchema,
  pi: PiSchema,
  submitter: SubmitterSchema,
  collaborators: z.array(CollaboratorSchema),
  uploadedFiles: z.array(UploadedFileSchema),
  control: ControlSchema,
  statusHistory: z.array(StatusHistoryEntrySchema),
  submitDate: z.string(),
  createDate: z.string(),
})
export type DuApplicationTransformed = z.infer<typeof DuApplicationTransformedSchema>
