# isTumor フィールドへの "mixed" 値追加

## 背景

`isTumor` フィールドは現在 `boolean | null` 型で、腫瘍組織と非腫瘍組織の両方を含むデータセット（例: 「肺腫瘍組織及び非腫瘍組織」）を正しく表現できない。

`healthStatus`, `sex`, `ageGroup`, `subjectCountType` はすべて `"mixed"` を持つ string enum だが、`isTumor` だけが boolean で設計上の不整合がある。

## 変更内容

`isTumor` の型を `boolean | null` から `string enum | null` に変更する。

### 新しい値の定義

| 値 | 意味 |
|---|---|
| `"tumor"` | 腫瘍組織のみ |
| `"normal"` | 正常組織のみ |
| `"mixed"` | 腫瘍・正常の両方を含む |
| `null` | 不明・記載なし |

### マイグレーション（既存データ）

| 旧値 | 新値 |
|---|---|
| `true` | `"tumor"` |
| `false` | `"normal"` |
| `null` | `null` |

## 影響範囲

### 型定義（3 ファイル）

- `src/crawler/types/structured.ts:85` — `z.boolean().nullable()` → `IsTumorEnum.nullable()`
- `src/crawler/llm/extract.ts:52,117,149,182` — Zod スキーマ、バリデーション、空フィールド、空チェック
- `src/es/types.ts:147` — `z.boolean().nullable()` → enum

### ES マッピング（1 ファイル）

- `src/es/dataset-schema.ts:62` — `f.boolean()` → `f.keyword()`

### LLM 抽出（1 ファイル）

- `src/crawler/llm/prompts.ts:39,109` — Field Guide とサンプル出力の更新

### API レイヤー（7 ファイル）

- `src/api/types/filters.ts:43` — `z.boolean()` → enum
- `src/api/types/es-docs.ts:112` — `z.array(z.boolean())` → `z.array(enum)`
- `src/api/types/query-params.ts:155,311` — `booleanFromString` → enum パーサー
- `src/api/es-client/filters.ts:167` — フィルタリスト（変更なしの可能性）
- `src/api/es-client/search.ts:176-178,251` — `nestedBooleanTermQuery` → `nestedTermQuery`、ファセット集計
- `src/api/routes/search.ts:70` — フィルタ受け渡し
- `src/api/routes/stats.ts:120` — stats 集計

### マージ・ユーティリティ（1 ファイル）

- `src/api/utils/merge-searchable.ts:23,132,177` — `boolean[]` → `string[]`、フィルタロジック

### クローラー（3 ファイル）

- `src/crawler/processors/structure.ts:533` — 初期値 `null`（変更なし）
- `src/crawler/cli/export-tsv.ts:716,762` — TSV 出力フォーマット
- `src/crawler/cli/import-tsv.ts:654` — `parseBooleanOrNull` → enum パーサー

### ドキュメント（6 ファイル）

- `docs/llm-extract-design.md`
- `docs/elasticsearch-schema.md`
- `docs/type-system.md`
- `docs/api-spec.md`
- `docs/search_spec.md`
- `docs/tsv-editing-guide.md`

## テスト

- 既存の isTumor 関連テストを enum 対応に修正
- マイグレーション: `true` → `"tumor"`, `false` → `"normal"` の変換が正しいことを確認
- API: `?isTumor=tumor`, `?isTumor=normal`, `?isTumor=mixed` でフィルタが動くことを確認
- ファセット集計に "mixed" が表示されることを確認

## 実装順序

1. docs/ の仕様書を更新
2. 型定義を変更（structured.ts, extract.ts, es/types.ts）
3. ES マッピング変更（dataset-schema.ts）
4. API レイヤー変更
5. クローラー（export/import TSV）変更
6. LLM プロンプト更新
7. テスト修正・追加
8. 既存データのマイグレーション（export-tsv → 手動変換 → import-tsv、または JSON 直接変換スクリプト）
