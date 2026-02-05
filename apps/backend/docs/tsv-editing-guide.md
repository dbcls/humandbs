# TSV 編集ガイド

HumanDBs のデータを手動で編集・校正するためのガイド。

## 作業場所

**Google Spreadsheet**: <https://docs.google.com/spreadsheets/d/1rB0HnbS8cQ6kBmclXGii1lSe1w2Y_syH9bG-aI24gpY/edit>

各 TSV が Spreadsheet の Tab に対応している。

## やること

### 1. 翻訳・校正作業

| Tab | 作業内容 |
|-----|---------|
| Research | タイトルの日英翻訳・校正 |
| ResearchSummary | 研究概要の日英翻訳・校正 |
| ResearchVersion | リリースノートの日英翻訳・校正 |

### 2. Dataset の確認

データタイプ（typeOfData）、公開条件（criteria）、公開日（releaseDate）を確認・修正。

### 3. 情報の補完・分離

| Tab | 作業内容 |
|-----|---------|
| ResearchDataProvider | 提供者情報の補完、複数人が1行に詰め込まれている場合の分離 |
| ResearchGrant | 助成金情報の補完 |
| ResearchPublication | 論文タイトル・DOI の補完 |
| ResearchProject | プロジェクト名・URL の補完 |
| ResearchCAU | 制限公開利用者情報の補完 |

### 4. Experiment の編集

LLM が抽出した `searchable_*` フィールドを確認・修正する。
値は英語に統一する（日本語のみの情報は英訳する）。

**確認ポイント:**

- 疾患名（searchable_diseases）が正しいか
- 組織名（searchable_tissues）が正しいか
- アッセイ種別（searchable_assayType）が正しいか
- 被験者数（searchable_subjectCount）が正しいか
- その他 searchable_* フィールドの値

**よくある修正:**

- LLM が抽出できなかった情報を追加
- 誤って抽出された情報を削除・修正
- 日本語のみの情報を英語に翻訳

## 編集のルール

### 編集できるカラム vs できないカラム

**編集禁止（識別子・参照情報）:**
Spreadsheet 上で薄紅色の背景で表示されている。

- `humId`, `humVersionId`, `version`, `datasetId`, `experimentIndex`
- `url_ja`, `url_en`
- `datasetIds`（ResearchPublication, ResearchCAU, ResearchVersion）
- `versionIds`, `latestVersion`, `firstReleaseDate`, `lastReleaseDate`

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
| platforms | シーケンサー | `["Illumina NovaSeq 6000"]` |
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

## 注意事項

### Experiment Tab の header 列について

Experiment Tab の `header_ja` / `header_en` は、元の MolTable（Molecular Data テーブル）のヘッダーをそのまま取得している。
MolTable のヘッダーは Accession ID（例: `JGAS000123`）などが入っていることが多く、Experiment の内容を表すヘッダーとしては不適切。

**主に assay type（実験種別）を記入する:**

- `WGS`
- `RNA-seq`
- `Targeted panel sequencing`
- `全ゲノムシーケンス`
- `エクソームシーケンス`

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

### 表記揺れは気にしなくてよい

`tissues`, `assayType` などの表記揺れは機械的な処理（[facet-normalize](crawler-pipeline.md#9-facet-normalize)）で自動的に統一される。
意味が正しければ細かい表記の違いは気にしなくてよい。

対象フィールドと変換ルールは [`src/crawler/data/facet-mappings/`](../src/crawler/data/facet-mappings/) の TSV を参照。

## 反映方法

Spreadsheet での編集後、システムに反映する手順:

1. TSV としてエクスポート
2. `bun run crawler:import-tsv` で JSON に反映
3. `bun run es:load-docs` で Elasticsearch に反映

## 関連ドキュメント

- [クローラーパイプライン](crawler-pipeline.md) - データ生成の全体フロー
- [LLM フィールド抽出](llm-extract-design.md) - searchable フィールドの抽出ロジック
