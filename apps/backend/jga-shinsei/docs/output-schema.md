# JGA 申請データ変換後スキーマ

EAV (Entity-Attribute-Value) パターンの `components` 配列を API フレンドリーな構造に変換した後のスキーマ定義。

型定義の SSOT は [`src/crawler/types/jga-shinsei.ts`](../../src/crawler/types/jga-shinsei.ts)。

## Union types

```typescript
type StatusCode = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80
type Lang = "ja" | "en"
type YesNo = "yes" | "no"
type DataAccess = "submission_open" | "submission_type1" | "submission_type2"
type ServerLocation = "onpre" | "offpre" | "both"
type OffPremiseServer = "nig" | "tombo" | "hgc" | "kog"
type UseReviewStatus = "completed" | "notyet" | "unnecessary"
```

## 共通型

### BilingualText

```typescript
interface BilingualText {
  ja: string | null
  en: string | null
}
```

### StatusHistoryEntry

```typescript
interface StatusHistoryEntry {
  status: StatusCode
  statusLabel: BilingualText
  date: string          // ISO 8601 datetime
}
```

| コード | ja | en |
|--------|----|----|
| 10 | 申請書類作成中 | Preparing |
| 20 | 申請完了 | Submitted |
| 30 | 申請者へ差し戻し中 | Revision requested |
| 40 | 審査中 | DAC reviewing |
| 50 | 申請却下 | Rejected |
| 60 | 申請承認 | Approved |
| 70 | 申請取り下げ | Canceled |
| 80 | 利用期間終了 | Closed |

## J-DS (データ提供申請) スキーマ

```typescript
interface DsApplicationTransformed {
  // --- ID ---
  jdsId: string            // "J-DS002495"
  jsubIds: string[]        // ["JSUB000481"]
  humIds: string[]         // ["hum0273"]
  jgaIds: string[]         // ["JGA000442"]

  // --- 研究内容 ---
  studyTitle: BilingualText
  aim: BilingualText
  method: BilingualText
  participant: BilingualText
  restriction: BilingualText
  publication: string | null   // submission_publication
  icd10: string | null

  // --- データ (multiValue グループ) ---
  data: DataEntry[]

  // --- 公開予定日 ---
  releaseDate: string | null   // "2024-12-28"

  // --- 匿名化 ---
  deIdentification: {
    status: string | null      // 例: "completed"
    date: string | null
    reason: string | null
  }

  // --- 倫理審査・ガイドライン ---
  review: {
    submissionStatus: string | null                                   // 例: "completed"
    submissionDate: string | null
    companyUseStatus: string | null                                   // 例: "ok"
    multicenterCollaborativeStudyStatus: "yes" | "no" | "piinstitution" | null
    nbdcDataProcessingStatus: string | null                           // 例: "ok"
    nbdcDataProcessingReason: string | null
    nbdcGuidelineStatus: YesNo | null
    isSimplifiedReview: boolean | null
  }

  // --- 人物情報 ---
  head: Head
  pi: Pi
  submitter: Submitter
  collaborators: Collaborator[]   // multiValue グループ
  uploadedFiles: UploadedFile[]   // multiValue グループ

  // --- 制御 ---
  control: Control

  // --- 履歴・日時 ---
  statusHistory: StatusHistoryEntry[]
  submitDate: string           // ISO 8601 datetime
  createDate: string           // ISO 8601 datetime
}
```

### DataEntry (multiValue グループ)

同一 index のキーを 1 つのデータセット記述として紐付ける。

```typescript
interface DataEntry {
  dataAccess: DataAccess | null
  studyType: string | null        // "study_type_wgs" 等。カンマ区切りで複数指定の場合あり
  studyTypeOther: string | null
  target: string | null
  fileFormat: string | null
  fileSize: string | null
}
```

## J-DU (データ利用申請) スキーマ

J-DS と共通のフィールド (head, pi, submitter, collaborators, uploadedFiles, control, statusHistory, submitDate, createDate) に加え、以下の固有フィールドを持つ。

```typescript
interface DuApplicationTransformed {
  // --- ID ---
  jduId: string            // "J-DU006529"
  jgadIds: string[]        // ["JGAD000369"]
  jgasIds: string[]        // ["JGAS000001"]
  humIds: string[]         // ["hum0273"]

  // --- 研究内容 ---
  studyTitle: BilingualText
  usePurpose: string | null
  useSummary: string | null
  usePublication: string | null

  // --- 利用データセット (multiValue グループ) ---
  useDatasets: UseDataset[]

  // --- 利用期間 ---
  usePeriod: {
    start: string | null   // "2024-12-01"
    end: string | null     // "2025-11-30"
  }

  // --- 倫理審査 ---
  useReview: {
    status: UseReviewStatus | null
    date: string | null
  }

  // --- サーバー ---
  server: {
    status: ServerLocation | null
    offPremiseStatus: OffPremiseServer[]   // multiValue (複数選択可)
    isOffPremiseStatement: boolean | null
    acknowledgmentStatus: YesNo | null
  }

  // --- 公開鍵 ---
  publicKey: {
    file: string | null
    txt: string | null
    key: string | null
  }

  // --- 利用報告 ---
  report: {
    summary: string | null
    publication: string | null
    intellectualProperty: string | null
    nbdcSharingGuidelineStatus: YesNo | null
    nbdcSharingGuidelineDetail: string | null
    newReportStatus: string | null
  }

  // --- 終了報告 ---
  deletion: {
    date: string | null
    keepSecondaryDataStatus: YesNo | null
    keepSecondaryDataDetail: string | null
  }

  // --- 加工データ配布 ---
  distribution: {
    status: YesNo | null
    detail: string | null
    way: string | null
    isStatement1: boolean | null
    isStatement2: boolean | null
  }

  // --- メンバー (multiValue グループ) ---
  members: Member[]

  // --- 共通 (J-DS と同じ) ---
  head: Head
  pi: Pi
  submitter: Submitter
  collaborators: Collaborator[]
  uploadedFiles: UploadedFile[]
  control: Control
  statusHistory: StatusHistoryEntry[]
  submitDate: string
  createDate: string
}
```

### UseDataset (multiValue グループ)

```typescript
interface UseDataset {
  request: string | null   // "JGAD000369"
  purpose: string | null
  id: string | null        // "JGAD000369"
}
```

### Member (multiValue グループ)

全 BilingualText の ja は常に null（component key に日本語版が存在しないため）。

```typescript
interface Member {
  accountId: string | null
  firstName: BilingualText      // ja は常に null
  middleName: BilingualText     // ja は常に null
  lastName: BilingualText       // ja は常に null
  email: string | null
  institution: BilingualText    // ja は常に null
  division: BilingualText       // ja は常に null
  job: BilingualText            // ja は常に null
  eradid: string | null
  orcid: string | null
}
```

## 共通サブ構造

### Head

```typescript
interface Head {
  name: string | null
  job: string | null
  phone: string | null
  email: string | null
}
```

### Pi

```typescript
interface Pi {
  accountId: string | null
  firstName: BilingualText
  middleName: BilingualText     // ja は常に null（component key が存在しない）
  lastName: BilingualText
  institution: BilingualText
  division: BilingualText
  job: BilingualText
  phone: string | null
  email: string | null
  address: Address
}
```

### Submitter

PI と似た構造。institution/division/middleName は ja が常に null（日本語版の component key が存在しないため）。

```typescript
interface Submitter {
  accountId: string | null
  firstName: BilingualText
  middleName: BilingualText     // ja は常に null
  lastName: BilingualText
  institution: BilingualText    // ja は常に null
  division: BilingualText       // ja は常に null
  job: BilingualText
  phone: string | null
  email: string | null
  address: Address
}
```

### Address

```typescript
interface Address {
  country: string | null
  postalCode: string | null
  prefecture: string | null
  city: string | null
  street: string | null
}
```

### Collaborator (multiValue グループ)

```typescript
interface Collaborator {
  name: string | null
  division: string | null
  job: string | null
  eradid: string | null
  orcid: string | null
  seminar: YesNo | null
}
```

### UploadedFile (multiValue グループ)

```typescript
interface UploadedFile {
  file: string | null
  type: string | null
}
```

### Control

```typescript
interface Control {
  lang: Lang | null
  groupId: string | null         // "subgrp2116"
  isNoneCollaborator: boolean | null
  privateComment: string | null
  isDeclareStatement: boolean | null
  isAgreeMailUse: boolean | null
}
```

## 変換ルール

### 命名規則

- snake_case → camelCase (`data_access` → `dataAccess`)
- prefix グループはネスト化 (`pi_first_name` → `pi.firstName`)

### BilingualText マージ

`_en` サフィックスのキーペアを 1 つの `{ ja, en }` オブジェクトにまとめる。

| 元キー (ja) | 元キー (en) | 出力フィールド |
|-------------|-------------|----------------|
| `aim` | `aim_en` | `aim: BilingualText` |
| `method` | `method_en` | `method: BilingualText` |
| `participant` | `participant_en` | `participant: BilingualText` |
| `restriction` | `restriction_en` | `restriction: BilingualText` |
| `submission_study_title` | `submission_study_title_en` | `studyTitle: BilingualText` (J-DS) |
| `use_study_title` | `use_study_title_en` | `studyTitle: BilingualText` (J-DU) |
| `pi_first_name` | `pi_first_name_en` | `pi.firstName: BilingualText` |
| `pi_last_name` | `pi_last_name_en` | `pi.lastName: BilingualText` |
| (なし) | `pi_middle_name_en` | `pi.middleName: BilingualText` (ja は null) |

### multiValue グループ紐付け

同じ prefix の multiValue キーを出現順 (index) で紐付けてオブジェクト配列化する。

| グループ | キー群 | 出力フィールド |
|----------|--------|----------------|
| data (J-DS) | `data_access`, `study_type`, `study_type_other`, `target`, `file_format`, `file_size` | `data: DataEntry[]` |
| collaborators | `collaborator_name`, `_division`, `_job`, `_eradid`, `_orcid`, `_seminar` | `collaborators: Collaborator[]` |
| members (J-DU) | `member_account_id`, `_first_name_en`, `_middle_name_en`, `_last_name_en`, `_email`, `_institution_en`, `_division_en`, `_job_en`, `_eradid`, `_orcid` | `members: Member[]` |
| useDatasets (J-DU) | `use_dataset_request`, `_purpose`, `_id` | `useDatasets: UseDataset[]` |
| uploadedFiles | `uploaded_file`, `uploaded_file_type` | `uploadedFiles: UploadedFile[]` |

### Boolean 変換

`is_*` prefix のフィールドは boolean に変換する。

| 元値 | 変換後 |
|------|--------|
| `"TRUE"`, `"true"`, `"ok"` | `true` |
| `"FALSE"`, `"false"` | `false` |
| 未設定 / null | `null` |

### トップレベルフィールド

- `create_date` → `createDate`
- `submit_date` → `submitDate`
- `status_history` → `statusHistory` (ステータスラベル付与)
