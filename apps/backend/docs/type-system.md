# 型システム

HumanDBs Backend のデータは以下の流れで変換される:

```plaintext
Crawler (TypeScript 型) -> ES (JSON ドキュメント) -> API (Zod スキーマ) -> Frontend (shared-types)
```

## システム間のデータフロー

### 1. Crawler -> Elasticsearch

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
| `Experiment` | `EsExperimentSchema` | |
| `SearchableExperimentFields` | `SearchableExperimentFieldsSchema` | platforms は nested 型で保存 |
| `DiseaseInfo` | `NormalizedDiseaseSchema` | icd10 は必須 (icd10-normalize で保証) |

### 2. Elasticsearch -> API

ES ドキュメントが API でどう返されるか。

| ES 型 (es/types.ts) | API 型 (api/types/) | 備考 |
|--------------------|---------------------|------|
| `EsResearchSchema` | `EsResearchDoc` | es-docs.ts で alias |
| `EsDatasetSchema` | `EsDatasetDoc` | es-docs.ts で alias |
| `EsResearchVersionSchema` | `EsResearchVersionDoc` | es-docs.ts で alias |

**変換処理**:

1. `es-client.ts` で ES からドキュメント取得
2. Zod スキーマでバリデーション
3. 必要に応じて `stripRawHtml()` で rawHtml 除去

### 3. API -> Frontend

API 型が Frontend にどう共有されるか。

| api/types/ | shared-types.ts | 用途 |
|------------|-----------------|------|
| `EsDatasetDoc` | `EsDatasetDoc` | Dataset 詳細表示 |
| `EsResearchDoc` | `EsResearchDoc` | Research 詳細表示 |
| `ResearchSearchResponse` | `ResearchSearchResponse` | 検索結果一覧 |
| `DatasetSearchResponse` | `DatasetSearchResponse` | 検索結果一覧 |
| `FacetsMap` | `FacetsMap` | ファセットフィルター |
| `SingleResponse` | `SingleResponse` | 単一リソース（編集可能）レスポンス |
| `SingleReadOnlyResponse` | `SingleReadOnlyResponse` | 単一リソース（読み取り専用）レスポンス |
| `ListResponse` | `ListResponse` | リストレスポンス |
| `SearchResponse` | `SearchResponse` | 検索レスポンス |
| `Pagination` | `Pagination` | ページネーション情報 |

**統一レスポンス形式**:

全ての API レスポンスは統一された形式で返される:

```typescript
// 単一リソース（編集可能）
interface SingleResponse<T> {
  data: T
  meta: {
    requestId: string
    timestamp: string
    _seq_no: number      // 楽観的ロック用
    _primary_term: number
  }
}

// 単一リソース（読み取り専用）
interface SingleReadOnlyResponse<T> {
  data: T
  meta: {
    requestId: string
    timestamp: string
  }
}

// リスト/検索
interface ListResponse<T> {
  data: T[]
  meta: {
    requestId: string
    timestamp: string
    pagination: Pagination
  }
}

interface SearchResponse<T> extends ListResponse<T> {
  facets?: FacetsMap  // includeFacets=true の場合
}
```

## 命名規則

### Zod スキーマと TypeScript 型

全ての API 型は Zod スキーマで定義し、TypeScript 型は `z.infer<>` で導出する。

| カテゴリ | Zod スキーマ名 | TypeScript 型名 | 例 |
|---------|---------------|-----------------|-----|
| 汎用 | `*Schema` | `*` | `PersonSchema` -> `Person` |
| レスポンス | `*ResponseSchema` | `*Response` | `HealthResponseSchema` -> `HealthResponse` |
| レスポンスメタ | `ResponseMeta*Schema` | `ResponseMeta*` | `ResponseMetaWithLockSchema` -> `ResponseMetaWithLock` |
| パスパラメータ | `*ParamsSchema` | `*Params` | `HumIdParamsSchema` -> `HumIdParams` |
| クエリパラメータ | `*QuerySchema` | `*Query` | `LangQuerySchema` -> `LangQuery` |
| リクエストボディ | `*RequestSchema` | `*Request` | `CreateResearchRequestSchema` -> `CreateResearchRequest` |
| POST 検索ボディ | `*BodySchema` | `*Body` | `ResearchSearchBodySchema` -> `ResearchSearchBody` |
| フィルタ | `*FiltersSchema` | `*Filters` | `DatasetFiltersSchema` -> `DatasetFilters` |

### ファイル配置規則

| ファイル | 内容 |
|---------|------|
| `common.ts` | 言語タイプ、共通ユーティリティ |
| `auth.ts` | 認証関連スキーマ |
| `workflow.ts` | ワークフロー状態 |
| `facets.ts` | ファセット名、ファセット値スキーマ |
| `es-docs.ts` | ES ドキュメントスキーマ（es/types からの alias） |
| `query-params.ts` | クエリパラメータスキーマ |
| `filters.ts` | 検索フィルタスキーマ |
| `response.ts` | 統一レスポンス型 (meta, pagination, wrapper factories) |
| `request-response.ts` | リクエスト/レスポンススキーマ |
| `index.ts` | バレルファイル（全エクスポート） |

### 注意事項

- **interface 禁止**: 全ての API 型は Zod スキーマで定義する。`interface` での定義は避け、`z.infer<>` で導出する
- **utility type**: `TypedFacetsMap` のような utility type は Zod スキーマ化不要
- **後方互換性**: 型の移動時は元のファイルから re-export を維持
- **エクスポート**: `types/shared-types.ts` から frontend に必要な型を re-export

## 主要な型定義

### structured.ts (Crawler 出力)

| 型 | 責務 |
|---|-----|
| `Research` | 研究メタデータ (バイリンガル) |
| `ResearchVersion` | バージョン履歴 |
| `Dataset` | データセット詳細 |
| `Experiment` | 実験データ (header, data, footers, searchable) |
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

  // シーケンシング品質
  sequencingDepth: number | null
  targetCoverage: number | null
  referenceGenome: string[]

  // バリアント
  variantCounts: VariantCounts | null  // { snv, indel, cnv, sv, total }
  hasPhenotypeData: boolean | null

  // その他
  targets: string | null
  fileTypes: string[]
  processedDataTypes: string[]
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
| `NormalizedDiseaseSchema` | 疾患情報 (icd10 は必須) |

**Crawler 型との違い**:

- `DiseaseInfo` -> `NormalizedDiseaseSchema`: `icd10` が `string | null` -> `string` (icd10-normalize で保証)
- `Research` -> `EsResearchSchema`: `status`, `uids` フィールド追加 (API 層で使用)
- `SearchableExperimentFields`: ES では `platforms` は nested 型 (`{vendor, model}` の配列) で保存し、vendor/model の対応関係を維持。API ファセットでは nested aggregation で抽出し `"Vendor||Model"` 形式で公開

**注意: SearchableExperimentFieldsSchema の二重定義**:

ES 層 (`es/types.ts`) では Crawler 層とは別に `SearchableExperimentFieldsSchema` を再定義している。主な違い:

- Crawler 版 (`crawler/types/structured.ts`): `diseases` の `icd10` は nullable
- ES 版 (`es/types.ts`): `diseases` に `NormalizedDiseaseSchema` を使用 (`icd10` は required)

Crawler 版は `CrawlerSearchableExperimentFieldsSchema` として alias で re-export されている。import 時は用途に応じて適切な方を選択すること

### api/types/ (API リクエスト・レスポンス)

`api/types/` ディレクトリに分割して定義。`api/types/index.ts` がバレルファイル。

| 型 | 定義ファイル | 責務 |
|---|-------------|-----|
| `ResearchSearchQuery` | query-params.ts | 検索クエリパラメータ (GET) |
| `DatasetSearchQuery` | query-params.ts | 検索クエリパラメータ (GET) |
| `ResearchSearchBody` | filters.ts | 検索リクエストボディ (POST) |
| `DatasetSearchBody` | filters.ts | 検索リクエストボディ (POST) |
| `DatasetFilters` | filters.ts | Dataset フィルタ条件 |
| `ResearchSearchResponse` | request-response.ts | 検索結果レスポンス |
| `DatasetSearchResponse` | request-response.ts | 検索結果レスポンス |
| `EsResearchDoc` | es-docs.ts | Research ドキュメント (ES alias) |
| `EsDatasetDoc` | es-docs.ts | Dataset ドキュメント (ES alias) |
| `EsResearchDetailDoc` | es-docs.ts | Research + ResearchVersion + Datasets の統合ドキュメント |
| `MergedSearchable` | es-docs.ts | Dataset 内の全 experiments.searchable をマージしたスキーマ |

## 型の追加・変更手順

**層ごとのスキーマ定義**: 基本スキーマは `crawler/types` で定義し、層ごとに必要な拡張・変換を行う。

- **Crawler**: 基本スキーマ（`DiseaseInfoSchema` の `icd10` は nullable）
- **ES**: 正規化・拡張スキーマ（`NormalizedDiseaseSchema` の `icd10` は required、`platforms` は nested 型）
- **API**: ES スキーマを再利用しつつ、リクエスト/レスポンス固有の型を定義

新しいフィールドを追加する場合:

### 1. Crawler の Zod スキーマを追加

`src/crawler/types/structured.ts` に Zod スキーマを追加:

```typescript
// SearchableExperimentFieldsSchema に追加
newField: z.string().nullable(),
```

これで `SearchableExperimentFields` 型にも自動的に追加される。

### 2. ES マッピングを追加

対象インデックスのマッピングファイルに追加:

- `src/es/dataset-schema.ts` - Dataset インデックス
- `src/es/research-schema.ts` - Research インデックス
- `src/es/research-version-schema.ts` - ResearchVersion インデックス

```typescript
// 例: dataset-schema.ts の searchable オブジェクト内に追加
newField: f.keyword(),
```

### 3. API スキーマを追加 (必要に応じて)

フィルタリングに使う場合、`src/api/types/filters.ts` にクエリパラメータを追加:

```typescript
// DatasetFiltersSchema に追加
newField: z.array(z.string()).optional(),
```

### 4. Frontend に共有 (必要に応じて)

`types/shared-types.ts` で re-export:

```typescript
export type { NewFieldType } from "./api/types"
```

### 注意事項

- **ES 固有の変更**: `es/types.ts` で ES 固有スキーマ (`NormalizedDiseaseSchema` など) を定義
- **API 固有の変更**: `api/types/` ディレクトリ内で API リクエスト/レスポンス型を定義
- **依存の方向**: `crawler/types -> es/types -> api/types/` を維持

## Crawler 内部の型変換 (参考)

HTML -> RawParseResult -> NormalizedParseResult -> SingleLang* -> Research/Dataset

| ファイル | 型 | パイプライン段階 |
|---------|---|----------------|
| `parse.ts` | `RawParseResult` | Step 2 出力 |
| `normalized.ts` | `NormalizedParseResult` | Step 3 出力 |
| `single-lang.ts` | `SingleLang*` | Step 4 中間形式 |
| `structured.ts` | `Research`, `Dataset` | Step 4-11 出力 |

### パイプライン段階と型の変化

```plaintext
Step 1: download-html
  -> HTML ファイル

Step 2: parse-html
  -> RawParseResult (parse.ts)
    - セクションごとにパース
    - 言語ごとに別ファイル

Step 3: normalize
  -> NormalizedParseResult (normalized.ts)
    - テキスト正規化
    - 日付フォーマット統一
    - Dataset ID 処理

Step 4: structure
  -> Research, Dataset (structured.ts)
    - ja/en をマージ
    - BilingualText 形式に統合

Step 5-11: enrich -> llm-extract -> icd10-normalize -> facet-values -> facet-normalize -> export-tsv -> import-tsv
  -> Dataset.experiments[].searchable に追加
```
