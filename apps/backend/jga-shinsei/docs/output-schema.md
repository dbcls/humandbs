# JGA 申請データ変換後スキーマ

EAV (Entity-Attribute-Value) パターンの `components` 配列を API フレンドリーな構造に変換した後のスキーマ。

型定義の SSOT は [`src/crawler/types/jga-shinsei.ts`](../../src/crawler/types/jga-shinsei.ts)。本ドキュメントは「型から読み取れない変換規約・ドメイン知識」だけをまとめる。

## ステータスコードと日英ラベルの対応

`StatusHistoryEntry.status` (整数) は以下の値を取り、`statusLabel` で日英ラベルに展開される。

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

## 変換ルール

### 命名規則

- snake_case → camelCase: `data_access` → `dataAccess`
- prefix グループはネスト化: `pi_first_name` → `pi.firstName`

### BilingualText マージ

`_en` サフィックスのキーペアを 1 つの `{ ja: string | null, en: string | null }` オブジェクトにまとめる。

| 元キー (ja) | 元キー (en) | 出力フィールド |
|-------------|-------------|----------------|
| `aim` | `aim_en` | `aim` |
| `method` | `method_en` | `method` |
| `participant` | `participant_en` | `participant` |
| `restriction` | `restriction_en` | `restriction` |
| `submission_study_title` | `submission_study_title_en` | `studyTitle` (J-DS) |
| `use_study_title` | `use_study_title_en` | `studyTitle` (J-DU) |
| `pi_first_name` | `pi_first_name_en` | `pi.firstName` |
| `pi_last_name` | `pi_last_name_en` | `pi.lastName` |
| (なし) | `pi_middle_name_en` | `pi.middleName` (ja は常に null) |

#### ja が常に null になる BilingualText

以下のフィールドは component key に日本語版が存在しないため、`{ ja: null, en: string | null }` の形になる。

- `pi.middleName`、`submitter.middleName`、`submitter.institution`、`submitter.division`
- J-DU の `members[].firstName / middleName / lastName / institution / division / job`

### multiValue グループ紐付け

同じ prefix の multiValue キーを出現順 (index) で紐付けてオブジェクト配列化する。

| グループ | 入力キー | 出力フィールド |
|----------|----------|----------------|
| data (J-DS) | `data_access`, `study_type`, `study_type_other`, `target`, `file_format`, `file_size` | `data: DataEntry[]` |
| collaborators | `collaborator_name`, `collaborator_division`, `collaborator_job`, `collaborator_eradid`, `collaborator_orcid`, `collaborator_seminar` | `collaborators: Collaborator[]` |
| members (J-DU) | `member_account_id`, `member_first_name_en`, `member_middle_name_en`, `member_last_name_en`, `member_email`, `member_institution_en`, `member_division_en`, `member_job_en`, `member_eradid`, `member_orcid` | `members: Member[]` |
| useDatasets (J-DU) | `use_dataset_request`, `use_dataset_purpose`, `use_dataset_id` | `useDatasets: UseDataset[]` |
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
- `status_history` → `statusHistory` (上表のステータスラベル付与)

## 変換前後の例

### 変換前 (EAV)

```json
{
  "jds_id": "J-DS002495",
  "application": { "create_date": "2024-12-03T..." },
  "components": [
    { "key": "aim", "value": "ゲノム解析による..." },
    { "key": "aim_en", "value": "Genomic analysis..." },
    { "key": "pi_first_name", "value": "太郎" },
    { "key": "pi_first_name_en", "value": "Taro" },
    { "key": "collaborator_name", "value": "Alice" },
    { "key": "collaborator_name", "value": "Bob" }
  ],
  "status_history": [{ "status": 10, "date": "2024-12-03T..." }],
  "submit_date": "2024-12-03T..."
}
```

### 変換後 (API フレンドリー)

```json
{
  "jdsId": "J-DS002495",
  "aim": { "ja": "ゲノム解析による...", "en": "Genomic analysis..." },
  "pi": {
    "firstName": { "ja": "太郎", "en": "Taro" },
    "institution": { "ja": "○○大学", "en": "XX University" }
  },
  "collaborators": [
    { "name": "Alice", "division": "..." },
    { "name": "Bob", "division": "..." }
  ],
  "statusHistory": [
    { "status": 10, "statusLabel": { "ja": "申請書類作成中", "en": "Preparing" }, "date": "..." }
  ],
  "createDate": "2024-12-03T..."
}
```

## J-DU 固有のドメイン用語

J-DU (データ利用申請) 出力スキーマには、JGA データ利用フローに特有の用語が含まれる。フィールド構造は [Zod schema](../../src/crawler/types/jga-shinsei.ts) が SSOT。本節ではフィールド名から読み取りにくいドメイン上の意味と、enum 系フィールドの取りうる値だけを補足する。

### Report (利用報告) — `report.*`

利用終了時または定期報告として申請者が提出する内容。

- `summary`, `publication`, `intellectualProperty`: 自由記述（成果サマリ / 公表業績 / 知財関連）
- `nbdcSharingGuidelineStatus` / `nbdcSharingGuidelineDetail`: NBDC データ共有ガイドラインに沿ったデータ共有を行ったかの自己申告 (`yes` / `no`) と詳細
- `newReportStatus`: 新規報告のステータス区分（NBDC 運用上の生の文字列）

### Deletion (データ削除報告) — `deletion.*`

利用終了に伴うデータ削除の報告。

- `date`: 削除実施日
- `keepSecondaryDataStatus` / `keepSecondaryDataDetail`: 利用期間中に派生した 2 次データ（解析結果など）を保持するか (`yes` / `no`) と内訳

### Distribution (加工データ配布) — `distribution.*`

利用期間中に第三者へ加工データを配布したかの報告。

- `status` (`yes` / `no`) / `detail` / `way`: 配布の有無、詳細、配布方法
- `isStatement1`, `isStatement2`: 配布時に申請者が同意した宣誓事項。文言は JGA 申請フォーム側で定義される

### Server (データ解析サーバー) — `server.*`

データを解析するサーバーの場所と種別。

- `status` (ServerLocation): 設置場所の区分。既知の DB 値: `onpre` / `offpre` / `both` / `na` / 空。新規値の追加に備え Schema は string で受ける
- `offPremiseStatus` (OffPremiseServer の配列): オフプレミス利用先の識別子。既知の DB 値: `nig` / `tommo` / `hgc` / `kog` / `kyudai` / 空。Schema は string
- `isOffPremiseStatement`: オフプレミス利用時の宣誓事項に同意したか
- `acknowledgmentStatus` (`yes` / `no`): 各種事項の受諾

### UseReview (倫理審査) — `useReview.*`

利用申請時点での倫理審査の進捗。

- `status`: `completed` (完了) / `notyet` (未完了) / `unnecessary` (不要)
- `date`: 完了日

### PublicKey (SSH 公開鍵) — `publicKey.*`

DDBJ サーバーへの SSH 接続のために申請者が登録する公開鍵。

- `file`: アップロードファイル名
- `txt`: 鍵テキストそのもの
- `key`: 鍵の識別子
