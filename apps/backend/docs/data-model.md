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

### catch-all field (`all_text`)

`research` / `dataset` の各 index は root に `all_text`（text 型）を持つ。自然文テキストと facet keyword は helper に catch-all 名を渡して（`generate-mapping.ts` の `CATCH_ALL_FIELD = "all_text"`、`f.text(C)` / `f.bilingualTextValue(C)` 等）`copy_to: all_text` を付与し、index 時に値を `all_text` へミラーする。フリーテキスト検索はこの単一フィールドへの `match` でドキュメント全体（nested 配下を含む）を全文検索する（`api/es-client/query-builders.ts`）。

- `dynamic: false` のため `all_text` 自身も明示宣言が必要（`*-schema.ts` の root に `all_text: f.text()`）
- `all_text` を含む全 text フィールドは index 既定 analyzer（kuromoji 形態素解析。`src/es/analysis.ts` の `INDEX_ANALYSIS_SETTINGS`、index 作成時に `settings.analysis` として付与）でトークナイズされる。日本語は語境界で分割、英語は小文字化される。analyzer は field 作成時に固定されるため、変更時は index 再作成 + 全再 ingest が必要
- `all_text` は `copy_to` のターゲットで `_source` には現れない write-time フィールド。Zod schema にも持たないため、`schema-consistency` テストでは Zod 比較から除外する
- 集約対象は自然文テキスト全般 + facet keyword。ID / コード / 数値 / boolean / URL は除外（ID は term / prefix 経路で扱う）
- `experiments.data`（`flattened`）は ES 仕様上 `copy_to` のソースにできず、`all_text` に含まれない

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
  - API リクエスト用スキーマでは、コンテキストに応じてフィールドを選択的に除外する（`request-response.ts`）:
    - `dataProvider`: `datasetIds`, `researchTitle`, `periodOfDataUse` を除外
    - `controlledAccessUser`: 全フィールドを含む
    - `relatedPublication`: 全フィールドを含む（`datasetIds` で論文とデータセットを紐付け）
  - Create/Update リクエストは `api/types/request-schemas.ts` の `*RequestSchema` 系を使用。`TextValue` 系フィールドから `rawHtml` を除外する（`{ text: string }` のみ）。ES 書き込み時に `api/utils/hydrate-raw-html.ts` の hydrator が `rawHtml: null` を注入する
  - `TextValueSchema.rawHtml` は `z.string().nullable()`
- **API → Frontend**: `types/shared-types.ts` で clean name（`Es` prefix なし）のみを re-export

依存の方向: `crawler/types → es/types → api/types/` を維持すること。
