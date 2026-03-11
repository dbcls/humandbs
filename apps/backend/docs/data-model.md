# データモデル

HumanDBs Backend のデータ構造に関する設計判断。

## ES インデックス

| インデックス | ID 形式 | 用途 |
|------------|--------|------|
| `research` | `{humId}` | 研究メタデータ |
| `research-version` | `{humId}-{version}` | バージョン履歴 |
| `dataset` | `{datasetId}-{version}` | データセット詳細 |

## マッピング設計

TypeScript 型は Zod スキーマから推論し、ES マッピングは `f` ヘルパーで明示的に定義する。

```plaintext
crawler/types/*.ts (Zod スキーマ = 型の源泉)
         ↓ 型推論
TypeScript 型 (Dataset, Research, etc.)

es/*-schema.ts (明示的 ES マッピング)
         ↓ generate-mapping.ts
ES mapping (JSON)
```

### バイリンガルヘルパー

多くのフィールドが日英両方を持つため、`f.bilingualText()` 等のヘルパーで `{ ja, en }` 構造を一括生成する。

### Nested vs Object

- **nested**: 配列要素間で独立したクエリが必要な場合 (例: diseases の label と icd10 の関係を保持)
- **object**: 単純なネストで十分な場合

`nested` は独立したドキュメントとして格納されるため、クエリ時にオーバーヘッドがある。必要な場合のみ使用する。

### 配列フィールド

ES マッピングでは配列を明示的に区別しない。`keyword` フィールドに配列を格納すると、ES が自動的に配列として処理する。配列かどうかは `src/crawler/types/structured.ts` の Zod スキーマを参照すること。

## 型の変換フロー

データは Crawler → ES → API → Frontend の 4 層を通過し、各層で型が変換される。

```plaintext
Crawler (structured.ts)  →  ES (es/types.ts)  →  API (api/types/)  →  Frontend (shared-types.ts)
```

- **Crawler → ES**: `es/types.ts` は crawler スキーマを `.extend()` で合成し、差分のみ定義する。同一構造のスキーマ（`PersonSchema`, `SummarySchema`, `ResearchVersionSchema` 等）は直接 re-export する
  - `EsDatasetSchema`: `originalMetadata` を `.extend()` で追加
  - `EsResearchSchema`: `status`, `uids`, `draftVersion` を `.extend()` で追加
  - Crawler の `latestVersion` は `z.string()` だが、ES では nullable（未公開時 null）
  - `draftVersion`: 編集中のバージョン（null = 編集なし）。ES 固有フィールド
  - `.describe()` は crawler スキーマ（SSOT）に定義されているため、ES スキーマが継承する
- **ES → API**: `api/types/es-docs.ts` で re-export。`api/types/views.ts` で API ビューモデル（`ResearchDetail`, `MergedSearchable` 等）を定義
- **API → Frontend**: `types/shared-types.ts` で clean name（`Es` prefix なし）のみを re-export

依存の方向: `crawler/types → es/types → api/types/` を維持すること。
