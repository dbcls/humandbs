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

- **Crawler → ES**: `es/types.ts` は crawler 型を re-export しつつ、ES 固有の拡張を追加する (例: `diseases.icd10` が nullable → required)。Research には `status` (`"draft" | "review" | "published" | "deleted"`) と `uids` (管理者が設定するユーザー ID 配列) が追加される
- **ES → API**: `api/types/es-docs.ts` で alias して Zod バリデーション経由で返す
- **API → Frontend**: `types/shared-types.ts` で必要な型を re-export

依存の方向: `crawler/types → es/types → api/types/` を維持すること。
