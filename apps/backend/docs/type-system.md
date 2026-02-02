# 型システム

HumanDBs Backend のデータは以下の流れで変換される:

```
Crawler (TypeScript 型) → ES (JSON ドキュメント) → API (Zod スキーマ) → Frontend (shared-types)
```

## システム間のデータフロー

### 1. Crawler → Elasticsearch

Crawler が生成した JSON ファイルが ES にどう入るか。

| Crawler 型 (structured.ts) | JSON ファイル | ES インデックス |
|---------------------------|--------------|----------------|
| `Research` | `research/{humId}.json` | research |
| `ResearchVersion` | `research-version/{humVersionId}.json` | research-version |
| `Dataset` | `dataset/{datasetId}-{version}.json` | dataset |

**型の対応**:

| Crawler (structured.ts) | ES (es/types.ts) | 備考 |
|------------------------|------------------|------|
| `Research` | `EsResearchSchema` | status, uids フィールド追加 |
| `Dataset` | `EsDatasetSchema` | |
| `Experiment` | `EsExperimentSchema` | experimentKey 追加 |
| `SearchableExperimentFields` | `SearchableExperimentFieldsSchema` | Zod で検証 |
| `DiseaseInfo` | `DiseaseInfoSchema` | icd10 は必須（icd10-normalize で保証） |

### 2. Elasticsearch → API

ES ドキュメントが API でどう返されるか。

| ES 型 (es/types.ts) | API 型 (api/types.ts) | 備考 |
|--------------------|----------------------|------|
| `EsResearchSchema` | `EsResearchDoc` | Zod スキーマで検証 |
| `EsDatasetSchema` | `EsDatasetDoc` | searchable は z.unknown() |
| `EsResearchVersionSchema` | `EsResearchVersionDoc` | |

**変換処理**:

1. `es-client.ts` で ES からドキュメント取得
2. Zod スキーマでバリデーション
3. 必要に応じて `stripRawHtml()` で rawHtml 除去

### 3. API → Frontend

API 型が Frontend にどう共有されるか。

| api/types.ts | shared-types.ts | 用途 |
|-------------|-----------------|------|
| `EsDatasetDoc` | `EsDatasetDoc` | Dataset 詳細表示 |
| `EsResearchDoc` | `EsResearchDoc` | Research 詳細表示 |
| `ResearchSearchResponse` | `ResearchSearchResponse` | 検索結果一覧 |
| `DatasetSearchResponse` | `DatasetSearchResponse` | 検索結果一覧 |
| `FacetsMap` | `FacetsMap` | ファセットフィルター |

## 主要な型定義

### structured.ts (Crawler 出力)

| 型 | 責務 |
|---|-----|
| `Research` | 研究メタデータ（バイリンガル） |
| `ResearchVersion` | バージョン履歴 |
| `Dataset` | データセット詳細 |
| `Experiment` | 実験データ（header, data, footers, searchable） |
| `SearchableExperimentFields` | LLM 抽出 + ルールベースのフィールド |
| `BilingualText` | `{ ja: string \| null, en: string \| null }` |
| `BilingualTextValue` | `{ ja: TextValue, en: TextValue }` (text + rawHtml) |

**SearchableExperimentFields の主要フィールド**:

```typescript
interface SearchableExperimentFields {
  // 被験者情報
  subjectCount: number | null
  subjectCountType: "individual" | "sample" | "mixed" | null
  healthStatus: "healthy" | "affected" | "mixed" | null

  // 疾病情報
  diseases: DiseaseInfo[]  // { label: string; icd10: string | null }

  // 生物学的サンプル
  tissues: string[]
  isTumor: boolean | null
  cellLine: string[]
  population: string[]

  // 人口統計
  sex: "male" | "female" | "mixed" | null
  ageGroup: "infant" | "child" | "adult" | "elderly" | "mixed" | null

  // 実験方法
  assayType: string[]
  libraryKits: string[]

  // プラットフォーム
  platforms: PlatformInfo[]  // { vendor: string; model: string }
  readType: "single-end" | "paired-end" | null
  readLength: number | null

  // その他
  targets: string | null
  fileTypes: string[]
  dataVolumeGb: number | null
  policies: NormalizedPolicy[]
}
```

### es/types.ts (ES ドキュメント)

Zod スキーマで定義。Crawler 型と似た構造だが ES 用の調整あり。

| 型/スキーマ | 責務 |
|------------|-----|
| `EsResearchSchema` | Research ES ドキュメントの Zod スキーマ |
| `EsDatasetSchema` | Dataset ES ドキュメントの Zod スキーマ |
| `EsExperimentSchema` | Experiment の Zod スキーマ |
| `SearchableExperimentFieldsSchema` | searchable フィールドの Zod スキーマ |
| `DiseaseInfoSchema` | 疾患情報（icd10 は必須） |

**Crawler 型との違い**:

- `DiseaseInfo.icd10`: `string | null` → `string`（icd10-normalize で保証）
- `Research`: `status`, `uids` フィールド追加（API 層で使用）

### api/types.ts (API レスポンス)

| 型 | 責務 |
|---|-----|
| `ResearchSearchQuery` | 検索クエリパラメータ（GET） |
| `DatasetSearchQuery` | 検索クエリパラメータ（GET） |
| `ResearchFiltersSchema` | 構造化フィルタ（POST） |
| `DatasetFiltersSchema` | 構造化フィルタ（POST） |
| `ResearchSearchResponse` | 検索結果レスポンス |
| `DatasetSearchResponse` | 検索結果レスポンス |
| `EsResearchDoc` | Research ドキュメント（API 用） |
| `EsDatasetDoc` | Dataset ドキュメント（API 用） |

## 型の追加・変更手順

新しいフィールドを追加する場合:

### 1. Crawler 型を追加

`src/crawler/types/structured.ts` に型を追加:

```typescript
// SearchableExperimentFields に追加
newField: string | null
```

### 2. ES Zod スキーマを追加

`src/es/types.ts` に Zod スキーマを追加:

```typescript
// SearchableExperimentFieldsSchema に追加
newField: z.string().nullable(),
```

### 3. ES マッピングを追加

`src/es/dataset-schema.ts` に ES マッピングを追加:

```typescript
// searchable オブジェクト内に追加
newField: f.keyword(),
```

### 4. API スキーマを追加（必要に応じて）

フィルタリングに使う場合、`src/api/types.ts` にクエリパラメータを追加:

```typescript
// DatasetFiltersSchema に追加
newField: z.array(z.string()).optional(),
```

### 5. Frontend に共有（必要に応じて）

`types/shared-types.ts` で re-export:

```typescript
export type { NewFieldType } from "./api/types"
```

## Crawler 内部の型変換（参考）

<details>
<summary>詳細を見る</summary>

HTML → RawParseResult → NormalizedParseResult → SingleLang* → Research/Dataset

| ファイル | 型 | パイプライン段階 |
|---------|---|----------------|
| `parse.ts` | `RawParseResult` | Step 2 出力 |
| `normalized.ts` | `NormalizedParseResult` | Step 3 出力 |
| `single-lang.ts` | `SingleLang*` | Step 4 中間形式 |
| `structured.ts` | `Research`, `Dataset` | Step 4-11 出力 |

### パイプライン段階と型の変化

```
Step 1: download-html
  → HTML ファイル

Step 2: parse-html
  → RawParseResult (parse.ts)
    - セクションごとにパース
    - 言語ごとに別ファイル

Step 3: normalize
  → NormalizedParseResult (normalized.ts)
    - テキスト正規化
    - 日付フォーマット統一
    - Dataset ID 処理

Step 4: structure
  → Research, Dataset (structured.ts)
    - ja/en をマージ
    - BilingualText 形式に統合

Step 5-11: enrich → llm-extract → icd10-normalize → facet-values → facet-normalize → export-tsv → import-tsv
  → Dataset.experiments[].searchable に追加
```

</details>
