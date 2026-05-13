# LLM フィールド抽出

クローラーパイプラインの Step 6 で、Ollama LLM を使って実験テーブルから検索可能フィールド (`searchable`)を抽出する。

## 概要

### 目的

HumanDBs ポータルサイトの実験データから、ファセット検索に必要なメタデータを自動抽出する。

### パイプライン内の位置

```plaintext
Step 4: structure
    ↓
Step 5: enrich (外部 API メタデータ付与)
    ↓
Step 6: llm-extract (このステップ)
    ↓ experiments[].searchable に追加
Step 7: icd10-normalize (diseases[].icd10 を正規化)
    ↓
Step 9: facet-normalize (以下のフィールドを正規化、数値フィールド異常値を null 化)
        - assayType, cellLine, fileTypes, libraryKits
        - platformVendor, platformModel, population
        - processedDataTypes, referenceGenome, targets, tissues
```

### 入出力

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/dataset/*.json` |
| 出力 | 同ファイルの `experiments[].searchable` フィールド |
| モデル | Ollama (CLI オプション `--model` で指定、デフォルト: `llama3.3:70b`) |

## 抽出フィールド一覧

フィールドの定義と型は `src/crawler/types/structured.ts` の `SearchableExperimentFieldsSchema` を参照。

以下は LLM 抽出に関わる要点のみ:

- `policies` 以外の全 searchable フィールドが LLM 抽出の対象
- `policies` はルールベースで抽出される (LLM 不使用)
- `diseases[].icd10` は明記時のみ抽出。正規化は後段の icd10-normalize で行う
- `tissues`, `assayType` 等は後段の facet-normalize で表記統一される
- 数値フィールド (`readLength`, `sequencingDepth`, `targetCoverage`, `dataVolumeGb`) の 0 以下の値は null 化される

## 抽出フロー

```plaintext
experiments[].data (実験テーブル)
  + experiments[].header
  + externalMetadata (JGA/DRA API)
           ↓
    LLM プロンプトに入力
           ↓
    LLM が JSON 出力
           ↓
experiments[].searchable に格納
           ↓
    Step 7: icd10-normalize
      diseases[].icd10 を正規化
           ↓
    Step 9: facet-normalize
      以下のフィールドを正規化:
        assayType, cellLine, fileTypes, libraryKits,
        platformVendor, platformModel, population,
        processedDataTypes, referenceGenome, targets, tissues
      数値フィールド異常値 (負値・ゼロ) を null 化
```

## プロンプト設計

### 入力形式

```json
{
  "en": {
    "header": "JGAS000100",
    "data": {
      "Materials and Participants": { "text": "..." },
      "Experimental Method": { "text": "..." },
      ...
    }
  },
  "ja": { ... },
  "externalMetadata": {
    "TITLE": "...",
    "DESCRIPTION": "..."
  }
}
```

### プロンプトの主要ルール

1. **全テキストは英語で出力**: 日本語は英訳する
2. **翻訳のみ、正規化しない**: "Life Technologies" → "Thermo Fisher" に変換しない
3. **存在する情報のみ抽出**: 推測しない。不明な場合は `null` または `[]`
4. **複数値は配列で返す**: diseases, tissues, assayType など
5. **ICD-10 は明記時のみ**: テキストに明示的に記載されている場合のみ抽出

### 出力例

```json
{
  "subjectCount": 60,
  "subjectCountType": "individual",
  "healthStatus": "mixed",
  "diseases": [{ "label": "lung cancer", "icd10": "C34" }],
  "tissues": ["tumor tissue", "peripheral blood"],
  "isTumor": "tumor",
  "cellLine": [],
  "population": ["Japanese"],
  "sex": "mixed",
  "ageGroup": "adult",
  "assayType": ["WGS"],
  "libraryKits": ["TruSeq DNA PCR-Free Library Prep Kit"],
  "platforms": [{ "vendor": "Illumina", "model": "NovaSeq 6000" }],
  "readType": "paired-end",
  "readLength": 150,
  "sequencingDepth": 30,
  "targetCoverage": null,
  "referenceGenome": ["GRCh38"],
  "variantCounts": { "snv": 5000000, "indel": null, "cnv": null, "sv": null, "total": null },
  "hasPhenotypeData": true,
  "targets": null,
  "fileTypes": [],
  "processedDataTypes": ["vcf"],
  "dataVolumeGb": 1536
}
```

## LLM の責務範囲

- **翻訳まで担当**: 日本語のフィールド値を英語に翻訳する（例: "末梢血" → "peripheral blood", "腫瘍組織" → "tumor tissue"）
- **同義語の統一はしない**: "RNA-Seq" / "RNAseq" / "mRNA-Seq" の統一は後段の facet-normalize に分離し、TSV マッピングで管理する

## フィールド追加の手順

新しい searchable フィールドを追加する場合、以下のファイルを変更する。具体的な書き方は各ファイルの既存フィールドに倣う。

| 手順 | 変更箇所 |
|---|---|
| 1. 型定義 | `src/crawler/types/structured.ts` の `SearchableExperimentFields` |
| 2. ES スキーマ | `src/es/types.ts` の `SearchableExperimentFieldsSchema` と `src/es/dataset-schema.ts` の `searchable` mapping |
| 3. プロンプト | `src/crawler/llm/prompts.ts` の Field Guide セクション |
| 4. LLM 出力スキーマ | `src/crawler/llm/extract.ts` の `LlmOutputBaseSchema` と `SearchableExperimentFieldsSchema`、および `createEmptySearchableFields()` / `isEmptySearchableFields()` |
| 5. (必要なら) 正規化 | `src/crawler/data/facet-mappings/<field>.tsv` を追加し、`src/crawler/cli/facet-values.ts` / `facet-normalize.ts` に対象を追加 |

## 実行コマンド

実行コマンド・CLI オプションは [crawler-pipeline.md § Step 6: llm-extract](crawler-pipeline.md#step-6-llm-extract) を参照。

## トラブルシューティング

### LLM が不正な JSON を返す

- Ollama モデルのバージョンを確認
- `--dry-run` でデバッグ
- 長い入力テキストをトリミングする

### 既存フィールドがスキップされる

- `--force` で再抽出

### policies が抽出されない

- policies はルールベースで抽出されるため LLM 不使用
- `src/crawler/processors/structure.ts` の `createSearchableWithPolicies` 関数を確認
