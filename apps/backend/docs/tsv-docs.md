# TSV ファイル編集ガイド

HumanDBs メタデータを編集するためのガイド。

## ファイル一覧

TSV ファイルは `crawler-results/tsv/` にある。

| ファイル | 内容 | 1行 = | インポート |
|---------|------|-------|----------|
| `research.tsv` | 研究の基本情報 | 1つの humId | - |
| `research-summary.tsv` | 研究の概要（目的・方法・対象） | 1つの humId | - |
| `research-data-provider.tsv` | データ提供者 | 1人の提供者 | - |
| `research-grant.tsv` | 助成金 | 1件の助成金 | - |
| `research-publication.tsv` | 関連論文 | 1件の論文 | ✓ |
| `research-project.tsv` | 研究プロジェクト | 1件のプロジェクト | - |
| `research-cau.tsv` | 制限公開データ利用者 | 1人の利用者 | - |
| `research-version.tsv` | バージョンごとのリリースノート | 1つのバージョン | - |
| `dataset.tsv` | データセット | 1つのデータセット | ✓ |
| `experiment.tsv` | 実験 | 1つの実験 | ✓ |

※「インポート」列が ✓ のファイルは `bun run crawler:import-tsv` で JSON に反映される。それ以外は確認用。

## 編集ルール

### 値の形式

| 形式 | 例 | 注意 |
|------|-----|------|
| JSON 配列 | `["JGAD000001","JGAD000002"]` | 形式を維持すること |
| 日付 | `2024-01-15` | `YYYY-MM-DD` |
| 真偽値 | `true` / `false` | 小文字のみ |
| 空値 | （空欄のまま） | `N/A` や `-` は使わない（`NA` は可） |
| データ容量 | `123.45 GB` | `数値 単位`（単位: KB, MB, GB, TB） |
| 疾患（diseases） | `["Cancer(C00-C97)","Diabetes"]` | `ラベル(ICD10)` または `ラベル` |

### comment カラム

各行の最後にある `comment` カラムは自由記述用。

例:

- 「要確認: タイトルの英語訳が不明」
- 「修正済み: 誤字を訂正」

## データ生成ロジック

### HumanDBs ページの構造

HumanDBs ポータルサイトの各研究ページ（例: hum0001）は以下の構造を持つ:

```
研究ページ (hum0001)
├── Summary（概要）
│   ├── 目的・方法・対象
│   └── Dataset 一覧テーブル（typeOfData, criteria, releaseDate）
├── Molecular Data テーブル群
│   ├── テーブル1: JGAS000001 のデータ
│   ├── テーブル2: JGAS000002 のデータ
│   └── ...
├── Data Provider（データ提供者）
├── Publications（論文）
└── Controlled Access Users（利用者）
```

### datasetId とは

**datasetId** は、データセットを一意に識別する ID。以下の形式がある:

| ID タイプ | 形式例 | 説明 |
|----------|--------|------|
| JGAD | JGAD000001 | JGA Dataset ID（主要な形式） |
| DRA | DRA000001 | DDBJ Read Archive |
| GEA | E-GEAD-000 | Genomic Expression Archive |
| NBDC | hum0001.v1.xxx | NBDC 独自形式 |
| BP | BP000001 | BioProject |
| METABO | MTBKS000001 | MetaboBank |

### Dataset の生成

Molecular Data テーブル群から datasetId を抽出し、datasetId ごとにグループ化して Dataset を生成する。

```
Molecular Data テーブル群
    ↓ (datasetId を抽出)
datasetId ごとにグループ化
    ↓
各 datasetId に対して Dataset を生成
```

**具体例:**

```
Molecular Data:
  - テーブル A: JGAS000001 (→ JGAD000001, JGAD000002)
  - テーブル B: JGAS000001 (→ JGAD000001, JGAD000002)
  - テーブル C: JGAS000002 (→ JGAD000003)

生成される Dataset:
  - JGAD000001: experiments = [テーブル A, テーブル B]
  - JGAD000002: experiments = [テーブル A, テーブル B]
  - JGAD000003: experiments = [テーブル C]
```

### Experiment の生成

各 **Experiment** は、1つの Molecular Data テーブルに対応する:

```
Molecular Data テーブル
├── header: テーブルのタイトル（例: JGAS000001）
├── data: キーバリューのペア
│   ├── Materials and Participants: "健常者 100名..."
│   ├── Platform: "Illumina HiSeq 2000"
│   └── ...
└── footers: 注記
```

### ja/en のマッチング

日本語ページと英語ページの Experiment は、以下の優先順位でマッチングされる:

1. **Accession ID の完全一致**: header に含まれる JGAS, DRA 等の ID
2. **header の類似度**: 文字列の類似度が高いもの
3. **位置**: 同じインデックス位置のもの

## 各ファイルのカラム

### research.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID（例: hum0001） | 禁止 |
| `title_ja` | 研究タイトル（日本語） | |
| `title_en` | 研究タイトル（英語） | |
| `url_ja` | 日本語ページの URL | 禁止 |
| `url_en` | 英語ページの URL | 禁止 |
| `versionIds` | バージョン ID のリスト（JSON 配列） | 禁止 |
| `latestVersion` | 最新バージョン | 禁止 |
| `firstReleaseDate` | 初回リリース日 | 禁止 |
| `lastReleaseDate` | 最終リリース日 | 禁止 |
| `comment` | メモ | |

### research-summary.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` | 日本語ページの URL | 禁止 |
| `url_en` | 英語ページの URL | 禁止 |
| `aims_ja` / `aims_en` | 研究の目的 | |
| `methods_ja` / `methods_en` | 研究の方法 | |
| `targets_ja` / `targets_en` | 研究の対象 | |
| `footers_ja` / `footers_en` | 注記（JSON 配列） | |
| `comment` | メモ | |

### research-data-provider.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` / `url_en` | ページ URL | 禁止 |
| `index` | 提供者の順番（0始まり） | 禁止 |
| `name_ja` / `name_en` | 氏名 | |
| `email` | メールアドレス | |
| `orcid` | ORCID ID | |
| `organization_name_ja` / `organization_name_en` | 所属機関名 | |
| `organization_country` | 国 | |
| `comment` | メモ | |

### research-grant.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` / `url_en` | ページ URL | 禁止 |
| `index` | 助成金の順番 | 禁止 |
| `grantId` | 助成金番号（JSON 配列） | |
| `title_ja` / `title_en` | 助成金名・プロジェクト名 | |
| `agency_name_ja` / `agency_name_en` | 助成機関名 | |
| `comment` | メモ | |

### research-publication.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` / `url_en` | ページ URL | 禁止 |
| `index` | 論文の順番 | 禁止 |
| `title_ja` / `title_en` | 論文タイトル | |
| `doi` | DOI | |
| `datasetIds` | 関連データセット ID（JSON 配列） | |
| `comment` | メモ | |

### research-project.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` / `url_en` | ページ URL | 禁止 |
| `index` | プロジェクトの順番 | 禁止 |
| `name_ja` / `name_en` | プロジェクト名 | |
| `project_url_ja` / `project_url_en` | プロジェクト URL | |
| `comment` | メモ | |

### research-cau.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `url_ja` / `url_en` | ページ URL | 禁止 |
| `index` | 利用者の順番 | 禁止 |
| `name_ja` / `name_en` | 氏名 | |
| `organization_name_ja` / `organization_name_en` | 所属機関名 | |
| `organization_country` | 国 | |
| `researchTitle_ja` / `researchTitle_en` | 研究タイトル | |
| `datasetIds` | 利用データセット ID（JSON 配列） | |
| `periodOfDataUse_start` | 利用開始日 | |
| `periodOfDataUse_end` | 利用終了日 | |
| `comment` | メモ | |

### research-version.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `humVersionId` | バージョン ID（例: hum0001-v1） | 禁止 |
| `version` | バージョン番号（例: v1） | 禁止 |
| `versionReleaseDate` | リリース日 | 禁止 |
| `releaseNote_ja` / `releaseNote_en` | リリースノート | |
| `datasetIds` | データセット ID リスト（JSON 配列） | 禁止 |
| `comment` | メモ | |

### dataset.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `humVersionId` | 親バージョン ID | 禁止 |
| `version` | バージョン | 禁止 |
| `datasetId` | データセット ID（例: JGAD000001） | 禁止 |
| `versionReleaseDate` | リリース日 | 禁止 |
| `typeOfData_ja` / `typeOfData_en` | データ種別 | |
| `criteria` | 公開区分（JSON 配列） | |
| `releaseDate` | 公開日（JSON 配列） | |
| `searchable_diseases` | 疾患リスト | |
| `searchable_tissues` | 組織リスト | |
| `searchable_populations` | 集団リスト | |
| `searchable_assayTypes` | 実験手法リスト | |
| `searchable_platforms` | プラットフォームリスト | |
| `searchable_readTypes` | リードタイプ | |
| `searchable_fileTypes` | ファイル形式リスト | |
| `searchable_totalSubjectCount` | 被験者数 | |
| `searchable_totalDataVolume` | データ容量（例: `123.45 GB`） | |
| `searchable_hasHealthyControl` | 健常者対照あり（true/false） | |
| `searchable_hasTumor` | 腫瘍サンプルあり（true/false） | |
| `searchable_hasCellLine` | 細胞株あり（true/false） | |
| `ageGroup` | 年齢層（手動キュレーション用） | |
| `region` | 地域（手動キュレーション用） | |
| `sex` | 性別（手動キュレーション用） | |
| `comment` | メモ | |

### experiment.tsv

| カラム名 | 説明 | 編集 |
|---------|------|------|
| `humId` | 研究 ID | 禁止 |
| `humVersionId` | 親バージョン ID | 禁止 |
| `version` | バージョン | 禁止 |
| `datasetId` | データセット ID | 禁止 |
| `experimentIndex` | 実験の順番 | 禁止 |
| `header_ja` / `header_en` | 実験ヘッダー | 禁止 |
| `extracted_subjectCount` | 被験者/サンプル数 | |
| `extracted_subjectCountType` | カウント単位（individual/sample/mixed） | |
| `extracted_healthStatus` | 健康状態（healthy/affected/mixed） | |
| `extracted_diseases` | 疾患リスト（`["ラベル(ICD10)"]`） | |
| `extracted_tissues` | 組織リスト | |
| `extracted_isTumor` | 腫瘍かどうか（true/false） | |
| `extracted_cellLine` | 細胞株名 | |
| `extracted_population` | 集団 | |
| `extracted_assayType` | 実験手法 | |
| `extracted_libraryKits` | ライブラリキットリスト | |
| `extracted_platformVendor` | プラットフォームベンダー | |
| `extracted_platformModel` | プラットフォームモデル | |
| `extracted_readType` | リードタイプ（single-end/paired-end） | |
| `extracted_readLength` | リード長 | |
| `extracted_targets` | ターゲット領域 | |
| `extracted_fileTypes` | ファイル形式リスト | |
| `extracted_dataVolume` | データ容量（例: `123.45 GB`） | |
| `comment` | メモ | |

## スプレッドシートでの編集

### Google スプレッドシート

1. TSV ファイルを Google ドライブにアップロード
2. 「アプリで開く」→「Google スプレッドシート」
3. 編集後「ダウンロード」→「タブ区切り形式 (.tsv)」

### Excel

1. 「データ」→「テキストまたは CSV から」
2. 区切り文字を「タブ」に設定
3. 編集後「名前を付けて保存」→「テキスト (タブ区切り)」

UTF-8 で保存すること。
