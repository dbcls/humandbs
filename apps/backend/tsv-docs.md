# TSV ファイル編集ガイド

このドキュメントは、HumanDBs のメタデータを編集するためのガイドです。

## 概要

`crawler-results/tsv/` ディレクトリには、HumanDBs ポータルサイトから抽出したメタデータが TSV（タブ区切り）形式で保存されています。これらのファイルを Google スプレッドシートや Excel で開いて、内容の確認・修正を行うことができます。

## ファイル一覧

### Research（研究）関連

| ファイル名 | 内容 | 1行 = |
|-----------|------|-------|
| `research.tsv` | 研究の基本情報 | 1つの humId |
| `research-summary.tsv` | 研究の概要（目的・方法・対象） | 1つの humId |
| `research-data-provider.tsv` | データ提供者情報 | 1人の提供者 |
| `research-grant.tsv` | 助成金情報 | 1件の助成金 |
| `research-publication.tsv` | 関連論文情報 | 1件の論文 |
| `research-project.tsv` | 研究プロジェクト情報 | 1件のプロジェクト |
| `research-cau.tsv` | 制限公開データ利用者情報 | 1人の利用者 |

### Research Version（研究バージョン）関連

| ファイル名 | 内容 | 1行 = |
|-----------|------|-------|
| `research-version.tsv` | バージョンごとのリリースノート | 1つのバージョン |

### Dataset / Experiment（データセット / 実験）関連

| ファイル名 | 内容 | 1行 = |
|-----------|------|-------|
| `dataset.tsv` | データセット情報 | 1つのデータセット |
| `experiment.tsv` | 実験情報 | 1つの実験 |

## 共通カラム

すべての TSV ファイルには以下の共通カラムがあります。

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `humId` | 研究 ID（例: hum0001） | **編集禁止** |
| `url_ja` | 日本語ページの URL | **編集禁止** |
| `url_en` | 英語ページの URL | **編集禁止** |
| `comment` | 連絡事項・メモ用（最後のカラム） | **編集可能** |

## カラム名の読み方

- `_ja` で終わるカラム: 日本語の値
- `_en` で終わるカラム: 英語の値
- `searchable_` で始まるカラム: 検索用に抽出された値
- `extracted_` で始まるカラム: LLM によって抽出された値

## 各ファイルの詳細

### research.tsv（研究基本情報）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `title_ja` | 研究タイトル（日本語） | 編集可能 |
| `title_en` | 研究タイトル（英語） | 編集可能 |
| `versionIds` | バージョン ID のリスト | **編集禁止** |
| `latestVersion` | 最新バージョン | **編集禁止** |
| `firstReleaseDate` | 初回リリース日 | **編集禁止** |
| `lastReleaseDate` | 最終リリース日 | **編集禁止** |

### research-summary.tsv（研究概要）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `aims_ja` / `aims_en` | 研究の目的 | 編集可能 |
| `methods_ja` / `methods_en` | 研究の方法 | 編集可能 |
| `targets_ja` / `targets_en` | 研究の対象 | 編集可能 |
| `footers_ja` / `footers_en` | 注記（JSON 配列） | 編集可能 |

### research-data-provider.tsv（データ提供者）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `index` | 提供者の順番（0始まり） | **編集禁止** |
| `name_ja` / `name_en` | 氏名 | 編集可能 |
| `email` | メールアドレス | 編集可能 |
| `orcid` | ORCID ID | 編集可能 |
| `organization_name_ja` / `organization_name_en` | 所属機関名 | 編集可能 |
| `organization_country` | 国 | 編集可能 |

### research-grant.tsv（助成金）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `index` | 助成金の順番 | **編集禁止** |
| `grantId` | 助成金番号（JSON 配列） | 編集可能 |
| `title_ja` / `title_en` | 助成金名・プロジェクト名 | 編集可能 |
| `agency_name_ja` / `agency_name_en` | 助成機関名 | 編集可能 |

### research-publication.tsv（論文）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `index` | 論文の順番 | **編集禁止** |
| `title_ja` / `title_en` | 論文タイトル | 編集可能 |
| `doi` | DOI | 編集可能 |
| `datasetIds` | 関連データセット ID（JSON 配列） | 編集可能 |

### research-project.tsv（研究プロジェクト）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `index` | プロジェクトの順番 | **編集禁止** |
| `name_ja` / `name_en` | プロジェクト名 | 編集可能 |
| `project_url_ja` / `project_url_en` | プロジェクト URL | 編集可能 |

### research-cau.tsv（制限公開データ利用者）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `index` | 利用者の順番 | **編集禁止** |
| `name_ja` / `name_en` | 氏名 | 編集可能 |
| `organization_name_ja` / `organization_name_en` | 所属機関名 | 編集可能 |
| `organization_country` | 国 | 編集可能 |
| `researchTitle_ja` / `researchTitle_en` | 研究タイトル | 編集可能 |
| `datasetIds` | 利用データセット ID（JSON 配列） | 編集可能 |
| `periodOfDataUse_startDate` | 利用開始日 | 編集可能 |
| `periodOfDataUse_endDate` | 利用終了日 | 編集可能 |

### research-version.tsv（バージョン）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `humVersionId` | バージョン ID（例: hum0001-v1） | **編集禁止** |
| `version` | バージョン番号（例: v1） | **編集禁止** |
| `versionReleaseDate` | リリース日 | **編集禁止** |
| `releaseNote_ja` / `releaseNote_en` | リリースノート | 編集可能 |
| `datasetIds` | データセット ID リスト（JSON 配列） | **編集禁止** |

### dataset.tsv（データセット）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `datasetId` | データセット ID（例: JGAD000001） | **編集禁止** |
| `version` | バージョン | **編集禁止** |
| `humVersionId` | 親バージョン ID | **編集禁止** |
| `versionReleaseDate` | リリース日 | **編集禁止** |
| `typeOfData_ja` / `typeOfData_en` | データ種別 | 編集可能 |
| `criteria` | 公開区分（JSON 配列） | 編集可能 |
| `releaseDate` | 公開日（JSON 配列） | 編集可能 |
| `searchable_*` | 検索用フィールド（下記参照） | 編集可能 |
| `llm_curated` | LLM 抽出済みフラグ | **編集禁止** |

**searchable_ フィールド一覧:**

- `searchable_diseases`: 疾患リスト
- `searchable_tissues`: 組織リスト
- `searchable_assayTypes`: 実験手法リスト
- `searchable_platforms`: プラットフォームリスト
- `searchable_readTypes`: リードタイプ
- `searchable_fileTypes`: ファイル形式リスト
- `searchable_totalSubjectCount`: 被験者数
- `searchable_totalDataVolume`: データ容量
- `searchable_hasHealthyControl`: 健常者対照あり（true/false）
- `searchable_hasTumor`: 腫瘍サンプルあり（true/false）
- `searchable_hasCellLine`: 細胞株あり（true/false）

### experiment.tsv（実験）

| カラム名 | 説明 | 編集可否 |
|---------|------|----------|
| `datasetId` | データセット ID | **編集禁止** |
| `experimentIndex` | 実験の順番 | **編集禁止** |
| `header_ja` / `header_en` | 実験ヘッダー | 編集可能 |
| `extracted_*` | LLM 抽出フィールド（下記参照） | 編集可能 |
| `llm_curated` | LLM 抽出済みフラグ | **編集禁止** |

**extracted_ フィールド一覧:**

- `extracted_subjectCount`: 被験者/サンプル数
- `extracted_subjectCountType`: カウント単位（individual/sample/mixed）
- `extracted_healthStatus`: 健康状態（healthy/affected/mixed）
- `extracted_diseases`: 疾患リスト
- `extracted_tissue`: 組織
- `extracted_isTumor`: 腫瘍かどうか（true/false）
- `extracted_cellLine`: 細胞株名
- `extracted_assayType`: 実験手法
- `extracted_libraryKit`: ライブラリキット
- `extracted_platformVendor`: プラットフォームベンダー
- `extracted_platformModel`: プラットフォームモデル
- `extracted_readType`: リードタイプ（single-end/paired-end）
- `extracted_readLength`: リード長
- `extracted_targets`: ターゲット領域
- `extracted_fileTypes`: ファイル形式
- `extracted_dataVolume`: データ容量

## 編集ルール

### 基本ルール

1. **編集禁止カラムは絶対に変更しない**
   - `humId`, `url_ja`, `url_en`, `index`, `version`, `humVersionId` など
   - これらは ID として使用されるため、変更するとデータの整合性が崩れます

2. **空欄は空欄のまま**
   - 値がない場合は空欄のままにしてください
   - 「-」や「N/A」などは入力しないでください
      - 「NA」だけ許容します

3. **JSON 配列の形式を維持**
   - `["値1","値2"]` の形式のカラムは、同じ形式を維持してください
   - 例: `["JGAD000001","JGAD000002"]`

4. **日付の形式**
   - `YYYY-MM-DD` 形式を使用してください
   - 例: `2024-01-15`

5. **true/false の値**
   - 小文字の `true` または `false` を使用してください

### comment カラムの使い方

- 各行の最後に `comment` カラムがあります
- 編集に関する連絡事項やメモを自由に記入できます
- 例:
  - 「要確認: タイトルの英語訳が不明」
  - 「修正済み: 誤字を訂正」
  - 「質問: この DOI は正しいですか？」

## スプレッドシートでの開き方

### Google スプレッドシート

1. Google ドライブに TSV ファイルをアップロード
2. ファイルを右クリック → 「アプリで開く」→「Google スプレッドシート」
3. 編集後、「ファイル」→「ダウンロード」→「タブ区切り形式 (.tsv)」

### Excel

1. Excel を開く
2. 「データ」タブ →「テキストまたは CSV から」
3. ファイルを選択し、区切り文字を「タブ」に設定
4. 編集後、「名前を付けて保存」→ ファイル形式「テキスト (タブ区切り)」

## 注意事項

- ファイルは UTF-8 エンコーディングで保存してください
- タブ文字や改行がデータ内に含まれる場合、`\t` や `\n` でエスケープされています
- 編集後のファイルは、同じファイル名で上書き保存してください
- 大量の編集を行う場合は、バックアップを取ってから作業してください

## データ生成ロジック

この章では、Dataset と Experiment がどのように生成されるかを説明します。

### HumanDBs の構造

HumanDBs ポータルサイトの各研究ページ（例: `hum0001-v1`）は以下の構造を持っています：

```
研究ページ (hum0001-v1)
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

**datasetId** は、データセットを一意に識別する ID です。以下の形式があります：

| ID タイプ | 形式例 | 説明 |
|----------|--------|------|
| JGAD | JGAD000001 | JGA Dataset ID（主要な形式） |
| JGAS | JGAS000001 | JGA Study ID → JGAD に変換されるため、出てこない |
| DRA | DRA000001 | DDBJ Read Archive |
| GEA | E-GEAD-000 | Genomic Expression Archive |
| NBDC | hum0001.v1.xxx | NBDC 独自形式 |
| BP | BP000001 | BioProject |
| METABO | MTBKS000001 | MetaboBank |

### datasetId の決定方法

datasetId は以下の手順で決定されます：

1. **Molecular Data テーブルからの抽出**
   - 各テーブルのヘッダー（例: `JGAS000001`）から ID を抽出
   - テーブル内のフィールド（Materials, Platform 等）からも ID を抽出

2. **JGAS → JGAD への変換**
   - JGAS ID は JGA API を使って対応する JGAD ID に変換
   - 例: `JGAS000001` → `JGAD000001`, `JGAD000002`

3. **Summary テーブルからの補完**
   - Summary の Dataset 一覧テーブルにも datasetId が記載されている
   - Molecular Data にない datasetId はここから取得

### Dataset の生成ロジック

```
Molecular Data テーブル群
    ↓ (datasetId を抽出)
datasetId ごとにグループ化
    ↓
各 datasetId に対して Dataset を生成
    ↓
Dataset = {
    datasetId,
    experiments: [関連する Molecular Data テーブル群],
    typeOfData, criteria, releaseDate: Summary から取得
}
```

**具体例：**

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

### Experiment の生成ロジック

各 **Experiment** は、1つの Molecular Data テーブルに対応します。

```
Molecular Data テーブル
├── header: テーブルのタイトル（例: JGAS000001）
├── data: キーバリューのペア
│   ├── Materials and Participants: "健常者 100名..."
│   ├── Platform: "Illumina HiSeq 2000"
│   ├── Library Construction: "..."
│   └── ...
└── footers: 注記
```

これが Experiment として出力されます：

```
experiment = {
    header: "JGAS000001",
    data: { Materials: "...", Platform: "...", ... },
    extracted_*: LLM が抽出した構造化データ
}
```

### Dataset のバージョニング

同じ datasetId でも、研究のバージョンが上がると内容が変わることがあります：

- **hum0001-v1** の JGAD000001: experiments = [テーブル A]
- **hum0001-v2** の JGAD000001: experiments = [テーブル A, テーブル B]（追加あり）

このとき、JGAD000001 には 2 つのバージョンが作られます：

- JGAD000001-v1: v1 の内容
- JGAD000001-v2: v2 の内容

TSV には**最新バージョンのみ**が出力されます。

### メタデータの継承 (ややこしいです)

Molecular Data から抽出された datasetId が Summary テーブルにない場合、以下のルールでメタデータを継承します：

1. 親テーブルの datasetId のメタデータを継承
2. プレフィックスが一致する datasetId のメタデータを継承
3. それでもない場合は空値

### ja/en のマッチング

日本語ページと英語ページの Experiment は、以下の優先順位でマッチングされます：

1. **Accession ID の完全一致**: header に含まれる JGAS, DRA 等の ID
2. **header の類似度**: 文字列の類似度が高いもの
3. **位置**: 同じインデックス位置のもの

マッチングできなかった場合は、片方の言語のみの Experiment として出力されます。
