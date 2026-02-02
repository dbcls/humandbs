# JGA Shinsei Database Schema

## スキーマ

- `ts_jgasys` - メインスキーマ

## 主要テーブル

### accession と metadata

```
accession (1) -----> (1) metadata
              accession_id
```

- `accession`: JGA ID を管理 (accession, alias)
- `metadata`: XML 形式のメタデータを格納

### JGA ID の階層 (relation)

```
submission (1) ----> (*) entry ----> (*) relation
             submission_id     entry_id

relation.self   --> accession (自分自身)
relation.parent --> accession (親 ID)
```

- `relation` テーブルで JGA ID 間の親子関係を管理

### J-DS との紐付け (submission_permission)

```
nbdc_application --> submission_permission --> submission
    |                       |
    v                       v
ds_du_id (J-DS)       submission_id (FK)
```

- `submission_permission` テーブルで J-DS と submission を直接紐付け
- `appl_id` と `submission_id` の組み合わせで 1:1 対応

### J-DU との紐付け (use_permission)

```
nbdc_application --> use_permission --> accession (JGAD)
    |                   |
    v                   v
ds_du_id (J-DU)    dataset_id (FK)
```

- `nbdc_application.ds_du_id` が J-DU ID
- `use_permission.dataset_id` で JGAD に紐付く

## 申請関連テーブル構造

```
nbdc_application_master (申請マスター)
├── ds_du_id (J-DS/J-DU ID)
├── data_type (1=J-DS, 2=J-DU)
└── account_group (group_id との紐付け)

nbdc_application (申請メイン)
├── appl_id (PK)
├── ds_du_id (J-DS/J-DU ID)
├── hum_id (将来拡充予定、現在はほぼ未入力)
├── study_title, study_title_en
├── pi_last_name, pi_first_name, ... (申請者情報)
└── create_date

nbdc_application_submit (申請提出)
├── appl_submit_id (PK)
├── appl_id (FK)
└── submit_date

nbdc_application_component (申請フォーム key-value)
├── appl_component_id (PK)
├── appl_submit_id (FK)
├── key (フィールド名)
├── value (フィールド値)
└── t_order (表示順序)

nbdc_application_status_history (ステータス履歴)
├── appl_status_history_id (PK)
├── appl_id (FK)
├── appl_status_type (ステータスコード)
└── history_date

submission_permission (J-DS <-> submission 紐付け)
├── submission_permission_id (PK)
├── appl_id (FK -> nbdc_application)
├── submission_id (FK -> submission)
└── submission_comment

use_permission (J-DU <-> JGAD 紐付け)
├── appl_id (FK -> nbdc_application)
└── dataset_id (FK -> accession)
```

## 申請ステータスコード

`nbdc_application_status_history.appl_status_type` は integer 型で、以下の値を取る:

| コード | 意味 | 説明 |
|--------|------|------|
| 10 | 作成 | 申請が作成された |
| 20 | 提出 | 申請が提出された |
| 30 | - | (未確認) |
| 40 | 審査中 | NBDC で審査中 |
| 50 | - | (未確認) |
| 60 | 承認 | 申請が承認された |
| 70 | - | (未確認) |
| 80 | 終了 | 利用期間終了など |

## 主要な component key

> **注意**: DB には key 名のラベルや説明を管理するマスターテーブルは存在しない。
> `nbdc_application_component.key` は単なる text 型で、外部キー参照もない。
> フォームフィールドの定義（ラベル、human-readable な名前）はアプリケーション側で管理されていると推測される。
> 以下の説明は実データから推測したもの。

### J-DS (データ提供申請)

| key | 説明 |
|-----|------|
| `submission_study_title` | 研究題目 |
| `submission_study_title_en` | 研究題目（英語） |
| `aim` | 研究目的 |
| `aim_en` | 研究目的（英語） |
| `method` | 研究方法 |
| `method_en` | 研究方法（英語） |
| `participant` | 研究参加者 |
| `participant_en` | 研究参加者（英語） |
| `restriction` | 利用制限 |
| `restriction_en` | 利用制限（英語） |
| `data_access` | アクセス制限 (submission_open, submission_controlled) |
| `study_type` | 研究種別 (study_type_wgs, etc.) |
| `file_format` | ファイル形式 |
| `file_size` | ファイルサイズ |
| `release_date` | 公開予定日 |
| `icd10` | ICD-10 コード |
| `pi_*` | 申請者情報 |
| `head_*` | 機関長情報 |
| `group_id` | グループ ID (submission との紐付け) |

### J-DU (データ利用申請)

| key | 説明 |
|-----|------|
| `use_study_title` | 利用研究題目 |
| `use_study_title_en` | 利用研究題目（英語） |
| `use_purpose` | 利用目的 |
| `use_summary` | 利用概要 |
| `use_publication` | 発表予定 |
| `use_dataset_request` | 申請対象 JGAD ID |
| `use_dataset_purpose` | データセット利用目的 |
| `use_period_start` | 利用開始日 |
| `use_period_end` | 利用終了日 |
| `server_status` | サーバー環境 (onpre, cloud) |
| `public_key` | 公開鍵 |
| `pi_*` | 申請者情報 |
| `submitter_*` | 提出者情報 |
| `member_*` | メンバー情報 |
| `collaborator_*` | 共同研究者情報 |
| `group_id` | グループ ID |

## 確認コマンド

```sql
-- スキーマ一覧
\dn

-- テーブル一覧
\dt ts_jgasys.*

-- テーブル構造確認（例）
\d ts_jgasys.accession
```
