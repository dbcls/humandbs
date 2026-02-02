# Elasticsearch スキーマ

HumanDBs Backend の Elasticsearch インデックス設計。

## インデックス一覧

| インデックス | ID 形式 | 用途 |
|------------|--------|------|
| `research` | `{humId}` | 研究メタデータ |
| `research-version` | `{humId}-{version}` | バージョン履歴 |
| `dataset` | `{datasetId}-{version}` | データセット詳細 |

## マッピング生成の仕組み

**Zod 単一ソース化**: TypeScript 型は `@/crawler/types` の Zod スキーマから推論される。
ES マッピングは `f` ヘルパーで明示的に定義する。

```
crawler/types/*.ts (Zod スキーマ = 型の源泉)
         ↓ 型推論
TypeScript 型 (Dataset, Research, etc.)

es/*-schema.ts (明示的 ES マッピング)
         ↓ generate-mapping.ts
ES mapping (JSON)
```

### ファイル構成

| ファイル | 内容 |
|---------|------|
| `src/crawler/types/structured.ts` | Zod スキーマ（型の単一ソース） |
| `src/es/types.ts` | crawler スキーマの re-export + ES 固有拡張 |
| `src/es/generate-mapping.ts` | マッピング生成ユーティリティ |
| `src/es/research-schema.ts` | research インデックスのスキーマ |
| `src/es/research-version-schema.ts` | research-version インデックスのスキーマ |
| `src/es/dataset-schema.ts` | dataset インデックスのスキーマ |

### フィールドタイプヘルパー

`f` オブジェクトで利用可能なヘルパー関数:

| ヘルパー | ES mapping | 用途 |
|---------|-----------|------|
| `f.keyword()` | `keyword` | 完全一致、ファセット、ソート |
| `f.text()` | `text` | 全文検索 |
| `f.textKw()` | `text` + `keyword` subfield | 全文検索 + 完全一致 |
| `f.date()` | `date` | 日付フィールド |
| `f.integer()` | `integer` | 整数 |
| `f.long()` | `long` | 大きい整数 |
| `f.float()` | `float` | 浮動小数点 |
| `f.boolean()` | `boolean` | 真偽値 |
| `f.flattened()` | `flattened` | 動的キーのオブジェクト |
| `f.noindex()` | `text` (index: false) | 格納のみ（検索不可） |
| `f.nested()` | `nested` | 独立クエリ可能な配列 |
| `f.object()` | `object` | ネストされたオブジェクト |

### バイリンガルヘルパー

| ヘルパー | 構造 | 用途 |
|---------|------|------|
| `f.bilingualText()` | `{ ja: text, en: text }` | バイリンガル全文検索 |
| `f.bilingualKeyword()` | `{ ja: keyword, en: keyword }` | バイリンガル完全一致 |
| `f.bilingualTextKw()` | `{ ja: text+kw, en: text+kw }` | 両方対応 |
| `f.bilingualTextValue()` | `{ ja: { text, rawHtml }, en: { text, rawHtml } }` | HTML 付きテキスト |
| `f.bilingualTextValueKw()` | 同上 + keyword subfield | 全文検索 + 完全一致 |

## research インデックス

研究の基本情報を格納。

```typescript
{
  // 識別子
  humId: keyword,

  // URL
  url: { ja: keyword, en: keyword },

  // タイトル（全文検索 + 完全一致）
  title: { ja: text+kw, en: text+kw },

  // バージョン情報
  versionIds: keyword[],
  latestVersion: keyword,

  // 日付
  datePublished: date,
  dateModified: date,

  // ステータス・所有権
  status: keyword,           // "draft" | "review" | "published" | "deleted"
  uids: keyword[],           // 編集権限ユーザー

  // Summary セクション
  summary: {
    aims: { ja: { text, rawHtml }, en: { text, rawHtml } },
    methods: { ja: { text, rawHtml }, en: { text, rawHtml } },
    targets: { ja: { text, rawHtml }, en: { text, rawHtml } },
    url: { ja: nested, en: nested },
    footers: { ja: { text, rawHtml }, en: { text, rawHtml } },
  },

  // Data Provider (nested)
  dataProvider: [{
    name: { ja: { text+kw, rawHtml }, en: { text+kw, rawHtml } },
    email: keyword,
    orcid: keyword,
    organization: {
      name: { ja: { text+kw, rawHtml }, en: { text+kw, rawHtml } },
      address: { country: keyword },
    },
    datasetIds: keyword[],
    researchTitle: { ja: text, en: text },
    periodOfDataUse: { startDate: keyword, endDate: keyword },
  }],

  // Research Project (nested)
  researchProject: [{
    name: { ja: { text+kw, rawHtml }, en: { text+kw, rawHtml } },
    url: { ja: { text, url }, en: { text, url } },
  }],

  // Grant (nested)
  grant: [{
    id: keyword,
    title: { ja: text+kw, en: text+kw },
    agency: { name: { ja: text+kw, en: text+kw } },
  }],

  // Related Publication (nested)
  relatedPublication: [{
    title: { ja: text+kw, en: text+kw },
    doi: keyword,
    datasetIds: keyword[],
  }],

  // Controlled Access User (nested)
  controlledAccessUser: [{
    name: { ja: { text+kw, rawHtml }, en: { text+kw, rawHtml } },
    organization: { ... },
    datasetIds: keyword[],
    researchTitle: { ja: text+kw, en: text+kw },
    periodOfDataUse: { startDate: keyword, endDate: keyword },
  }],
}
```

## research-version インデックス

バージョンごとのリリース情報を格納。

```typescript
{
  // 識別子
  humId: keyword,
  humVersionId: keyword,
  version: keyword,

  // 日付
  versionReleaseDate: date,

  // Dataset 参照
  datasetIds: keyword[],

  // リリースノート
  releaseNote: { ja: { text, rawHtml }, en: { text, rawHtml } },
}
```

## dataset インデックス

データセットの詳細情報を格納。

```typescript
{
  // 識別子
  datasetId: keyword,
  version: keyword,
  humId: keyword,
  humVersionId: keyword,

  // 日付
  versionReleaseDate: date,
  releaseDate: date,

  // 分類
  criteria: keyword,                    // "Controlled-access (Type I/II)" or "Unrestricted-access"
  typeOfData: { ja: keyword, en: keyword },

  // Experiments (nested)
  experiments: [{
    experimentKey: keyword,

    // Header（実験タイトル）
    header: { ja: { text+kw, rawHtml }, en: { text+kw, rawHtml } },

    // Data（動的キーバリュー）
    data: flattened,

    // Footers
    footers: { ja: { text, rawHtml }, en: { text, rawHtml } },

    // Searchable fields（LLM 抽出 + ルールベース）
    searchable: {
      // 被験者情報
      subjectCount: integer,
      subjectCountType: keyword,         // "individual" | "sample" | "mixed"
      healthStatus: keyword,             // "healthy" | "affected" | "mixed"

      // 疾病情報 (nested)
      diseases: [{
        label: keyword,
        icd10: keyword,
      }],

      // 生物学的サンプル
      tissues: keyword[],
      isTumor: boolean,
      cellLine: keyword[],
      population: keyword[],

      // 人口統計
      sex: keyword,                      // "male" | "female" | "mixed"
      ageGroup: keyword,                 // "infant" | "child" | "adult" | "elderly" | "mixed"

      // 実験方法
      assayType: keyword[],
      libraryKits: keyword[],

      // プラットフォーム
      platforms: keyword[],              // "{vendor} {model}" 形式
      readType: keyword,                 // "single-end" | "paired-end"
      readLength: integer,

      // シーケンシング品質
      sequencingDepth: float,
      targetCoverage: float,
      referenceGenome: keyword[],

      // バリアント数
      variantCounts: {
        snv: long,
        indel: long,
        cnv: long,
        sv: long,
        total: long,
      },
      hasPhenotypeData: boolean,

      // ターゲット領域
      targets: text+kw,

      // データ情報
      fileTypes: keyword[],
      processedDataTypes: keyword[],
      dataVolumeGb: float,

      // ポリシー (nested)
      policies: [{
        id: keyword,
        name: { ja: keyword, en: keyword },
        url: keyword,
      }],
    },
  }],
}
```

## クエリ例

### 研究タイトル検索（全文検索）

```json
{
  "query": {
    "multi_match": {
      "query": "がん",
      "fields": ["title.ja", "title.en"]
    }
  }
}
```

### 疾患名ファセット（アグリゲーション）

```json
{
  "aggs": {
    "diseases": {
      "nested": { "path": "experiments.searchable.diseases" },
      "aggs": {
        "labels": {
          "terms": { "field": "experiments.searchable.diseases.label" }
        }
      }
    }
  }
}
```

### ICD-10 プリフィックス検索

```json
{
  "query": {
    "nested": {
      "path": "experiments.searchable.diseases",
      "query": {
        "prefix": { "experiments.searchable.diseases.icd10": "C" }
      }
    }
  }
}
```

### 複数条件フィルタ

```json
{
  "query": {
    "bool": {
      "must": [
        { "term": { "criteria": "Unrestricted-access" } },
        {
          "nested": {
            "path": "experiments",
            "query": {
              "term": { "experiments.searchable.assayType": "WGS" }
            }
          }
        }
      ]
    }
  }
}
```

### 被験者数範囲検索

```json
{
  "query": {
    "nested": {
      "path": "experiments",
      "query": {
        "range": {
          "experiments.searchable.subjectCount": {
            "gte": 100
          }
        }
      }
    }
  }
}
```

## インデックスの再作成

```bash
# インデックスを削除
curl -X DELETE "http://humandbs-elasticsearch-dev:9200/research,research-version,dataset"

# マッピングを作成
bun run es:load-mappings

# ドキュメントをロード
bun run es:load-docs
```

## Nested vs Object

- **nested**: 配列要素間で独立したクエリが必要な場合（例: diseases の label と icd10 の関係を保持）
- **object**: 単純なネストで十分な場合

`nested` は独立したドキュメントとして格納されるため、クエリ時にオーバーヘッドがある。必要な場合のみ使用する。
