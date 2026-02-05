# TSV 編集ガイド

HumanDBs のデータを手動で編集・校正するためのガイド。

## 作業場所

**Google Spreadsheet**: <https://docs.google.com/spreadsheets/d/1yAWRGBsj2BqilaMKerbxQl38vbpDsLiYA5X8i2KY55w/edit?usp=sharing>

## やること

※ Research / Dataset / Experiment の関係については [Dataset と Experiment の概念](#dataset-と-experiment-の概念) を参照。

### 1. Research 系 / 2. Dataset

現ポータルから機械的に抽出したデータ。
変なデータがないかを確認し、余裕があれば修正する。

| Tab | 編集内容 |
|-----|---------|
| Research | タイトル（title_ja, title_en） |
| ResearchSummary | 研究概要（aims, methods, targets） |
| ResearchDataProvider | 提供者名、所属、メール、ORCID |
| ResearchVersion | リリースノート |
| ResearchGrant | 助成金 ID、タイトル、機関名 |
| ResearchPublication | 論文タイトル、DOI |
| ResearchProject | プロジェクト名、URL |
| ResearchCAU | 制限公開利用者名、所属、研究タイトル、利用期間 |
| Dataset | データタイプ（typeOfData）、公開条件（criteria）、公開日（releaseDate） |

ResearchGrant, ResearchPublication, ResearchProject, ResearchCAU は、1 行に複数件が詰め込まれている場合、行を分離してもよい（[行の追加・分離](#行の追加分離)を参照）。

### 3. Experiment

LLM で最新 Dataset から検索・統計用に抽出したデータ。
間違っていても検索でヒットしない程度の影響なので、後から随時修正できる。

| Tab | 編集内容 |
|-----|---------|
| Experiment | ヘッダー（header_ja, header_en）、searchable_* フィールド |

**header 列について:**
`header_ja` / `header_en` は元の MolTable のヘッダーをそのまま取得しており、Accession ID（例: `JGAS000123`）などが入っていることが多い。
主に assay type（実験種別）を記入する: `WGS`, `RNA-seq`, `Targeted panel sequencing`, `全ゲノムシーケンス` など。

**searchable_* フィールドについて:**
値は英語に統一する。詳細は [searchable フィールド一覧](#searchable-フィールド一覧) を参照。

## 編集のルール

### 編集できるカラム vs できないカラム

**編集禁止（識別子・参照情報）:**
Spreadsheet 上で薄紅色の背景で表示されている。

- `humId`, `humVersionId`, `version`, `datasetId`
- `url_ja`, `url_en`
- `versionIds`, `latestVersion`, `firstReleaseDate`, `lastReleaseDate`
- `versionReleaseDate`（ResearchVersion, Dataset）
- `datasetIds`（ResearchPublication, ResearchCAU, ResearchVersion）

**編集可能:**
上記以外のカラム（背景色なし）。

### 値の書き方

| 形式 | 書き方 | 例 |
|------|--------|-----|
| JSON 配列 | `["値1", "値2"]` | `["WGS", "RNA-seq"]` |
| 疾患 + ICD10 | `["疾患名(ICD10)"]` | `["Breast cancer(C50)"]` |
| 真偽値 | `TRUE` / `FALSE` | `TRUE` |
| 空値 | 空欄のまま | |
| 数値 | 数字のみ | `100` |

### comment カラム

各行の最後にある `comment` カラムは自由記述用。メモや確認事項を記入できる。インポート時は無視される。

### 行の追加・分離

`index` フィールドを編集することで行の追加・分離ができる:

```plaintext
# 元（1行に2人）
humId    index  name_ja
hum0001  0      山田太郎、鈴木花子

# 編集後（2行に分離）
humId    index  name_ja
hum0001  0      山田太郎
hum0001  1      鈴木花子
```

### 表記揺れについて

`tissues`, `assayType` などの一部フィールドは、LLM 抽出後に機械的な処理（[facet-normalize](crawler-pipeline.md#9-facet-normalize)）で表記を統一している。
対象フィールドと変換ルールは [`src/crawler/data/facet-mappings/`](../src/crawler/data/facet-mappings/) の TSV を参照。

※ この分類・統一ルールは今後見直す可能性がある。

## searchable フィールド一覧

Experiment Tab で編集する主要なフィールド:

| カラム | 説明 | 値の例 |
|--------|------|--------|
| subjectCount | 被験者数 | `100` |
| subjectCountType | 被験者数の単位 | `individual` / `sample` / `mixed` |
| healthStatus | 健康状態 | `healthy` / `affected` / `mixed` |
| diseases | 疾患名 | `["Breast cancer(C50)", "Lung cancer"]` |
| tissues | 組織・臓器 | `["peripheral blood", "liver"]` |
| isTumor | 腫瘍サンプルか | `TRUE` / `FALSE` |
| cellLine | 細胞株名 | `["HeLa", "HEK293"]` |
| population | 集団 | `["Japanese", "European"]` |
| sex | 性別 | `male` / `female` / `mixed` |
| ageGroup | 年齢層 | `infant` / `child` / `adult` / `elderly` / `mixed` |
| assayType | アッセイ種別 | `["WGS", "RNA-seq", "ChIP-seq"]` |
| libraryKits | ライブラリキット | `["TruSeq DNA"]` |
| platforms | シーケンサー | `[{"vendor": "Illumina", "model": "NovaSeq 6000"}]` |
| readType | リードタイプ | `single-end` / `paired-end` |
| readLength | リード長 (bp) | `150` |
| sequencingDepth | シーケンス深度 (x) | `30` |
| targetCoverage | ターゲットカバレッジ (%) | `99` |
| referenceGenome | 参照ゲノム | `["GRCh38", "GRCh37"]` |
| hasPhenotypeData | 表現型データ有無 | `TRUE` / `FALSE` |
| targets | ターゲット領域 | `exome` / `panel` |
| fileTypes | ファイル形式 | `["FASTQ", "BAM", "VCF"]` |
| processedDataTypes | 処理済みデータ | `["VCF", "expression matrix"]` |
| dataVolumeGb | データ容量 (GB) | `500` |
| variantCounts | バリアント数 | `{"snv": 5000000, "indel": 100000, "cnv": null, "sv": null, "total": null}` |

## Dataset と Experiment の概念

編集時に参照する元の HTML ページには「Molecular Data」テーブル（MolTable）が記載されている。
クローラーパイプラインでは、この MolTable を変換し、以下の階層構造にしている:

```plaintext
Research (hum0001)
  └─ Dataset (JGAD000001, hum0001.v1.freq.v1, ...)
       └─ Experiment (≒ MolTable のセル)
```

### Dataset ID

Dataset ID として以下の外部 ID を流用している:

- `JGAD000000` - JGA Dataset（JGAS は JGAD に展開される）
- `E-GEAD-000` - GEA
- `DRA000000` 等 - DDBJ Sequence Read Archive
- `PRJDB00000` - BioProject
- `MTBKS000` - MetaboBank
- `hum0000.v0.xxx.v0` - NBDC 独自形式（外部 ID がない場合）

### MolTable から Dataset / Experiment への変換

ある hum ページに複数の MolTable がある場合、同じ Dataset ID が複数の MolTable に出現することがある。
この場合、Dataset は MolTable をまたいで統合され、各 MolTable からの情報が Experiment として格納される。

例:

```plain
MolTableA = [Dataset1, Dataset2]
MolTableB = [Dataset2, Dataset3]

↓ 変換後

Dataset1 = [ExperimentA]               # MolTableA 由来
Dataset2 = [ExperimentA, ExperimentB]  # MolTableA, MolTableB 両方由来
Dataset3 = [ExperimentB]               # MolTableB 由来
```

詳細は [クローラーパイプライン](crawler-pipeline.md) を参照。

## 反映方法

Spreadsheet での編集後、システムに反映する手順:

1. TSV としてエクスポート
2. `bun run crawler:import-tsv` で JSON に反映
3. `bun run es:load-docs` で Elasticsearch に反映

## 関連ドキュメント

- [クローラーパイプライン](crawler-pipeline.md) - データ生成の全体フロー
- [LLM フィールド抽出](llm-extract-design.md) - searchable フィールドの抽出ロジック
