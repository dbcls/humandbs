# クローラーパイプライン

HumanDBs ポータルサイトから研究データベース情報をクロールし、構造化データを生成するパイプライン。

## 概要

11 ステップのパイプラインで、HTML ダウンロードから TSV インポートまでを処理する:

```
                          [抽出フェーズ]
Step 1-2: HTML ダウンロード → HTML パース
                               ↓
                          [正規化フェーズ]
Step 3:   テキスト正規化・日付フォーマット統一
                               ↓
                          [構造化フェーズ]
Step 4-5: ja/en 統合 → 外部 API メタデータ付与
                               ↓
                          [自動抽出フェーズ]
Step 6-9: LLM 抽出 → ICD10 分離 → ファセットマッピング
                               ↓
                          [手動編集サイクル]
Step 10-11: TSV エクスポート → 手動編集 → TSV インポート
```

## データフロー図

```
crawler-results/
├── html/                     ← Step 1 出力
│   ├── detail-{humVersionId}-{lang}.html
│   └── release-{humVersionId}-{lang}-release.html
│
├── detail-json/              ← Step 2 出力
│   └── {humVersionId}-{lang}.json (RawParseResult)
│
├── normalized-json/          ← Step 3 出力
│   └── {humVersionId}-{lang}.json (NormalizedParseResult)
│
├── structured-json/          ← Step 4-11 出力（in-place 更新）
│   ├── research/{humId}.json
│   ├── research-version/{humVersionId}.json
│   └── dataset/{datasetId}-{version}.json
│
└── tsv/                      ← Step 10 出力
    ├── research.tsv
    ├── dataset.tsv
    ├── experiment.tsv
    └── ...
```

## 各ステップの詳細

### Step 1: download-html

HumanDBs ポータルから HTML をダウンロードしてキャッシュする。

```bash
bun run crawler:download-html

# オプション
--hum-id {id}     # 特定の humId のみダウンロード
--lang {ja|en}    # 言語指定
--force           # キャッシュを無視して再ダウンロード
--concurrency {n} # 並列ダウンロード数
--verbose         # デバッグログを表示
```

| 項目 | 内容 |
|------|------|
| 入力 | HumanDBs ポータル URL |
| 出力 | `crawler-results/html/` |
| 処理内容 | 全 humId または指定 humId の HTML ファイルをダウンロード。v1, v2, v3... を試行して存在確認。 |
| キャッシュ | 既存ファイルがあればスキップ（`--force` で無効化） |

### Step 2: parse-html

HTML をパースして構造化データ (RawParseResult) を生成する。

```bash
bun run crawler:parse-html

# オプション
--hum-id {id}     # 特定の humId のみ処理
--lang {ja|en}    # 言語指定
--concurrency {n} # 並列処理数
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/html/` |
| 出力 | `crawler-results/detail-json/` |
| 処理内容 | HTML から構造化データを抽出。セクションごとにパース。 |

### Step 3: normalize

パース結果を正規化する（テキスト正規化、日付フォーマット、Dataset ID 処理など）。

```bash
bun run crawler:normalize

# オプション
--hum-id {id}     # 特定の humId のみ処理
--lang {ja|en}    # 言語指定
--concurrency {n} # 並列処理数
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/detail-json/` |
| 出力 | `crawler-results/normalized-json/` |
| 処理内容 | テキスト正規化（空白、全角文字、引用符）、日付フォーマット変換（YYYY/M/D → YYYY-MM-DD）、データセット ID 処理、基準の正規化 |

### Step 4: structure

正規化データから ja/en をマージし、Research / ResearchVersion / Dataset を生成する。

```bash
bun run crawler:structure

# オプション
--hum-id {id}  # 特定の humId のみ処理
--force        # 既存ファイルを上書き
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/normalized-json/` |
| 出力 | `crawler-results/structured-json/` |
| 処理内容 | ja/en を統合したマルチリンガル構造に変換。Research/ResearchVersion/Dataset オブジェクトを生成。 |

**注意**: ID 変更時は `rm -rf crawler-results/structured-json/dataset/*.json` で残骸を削除してから実行する。

### Step 5: enrich

JGA/DRA/DOI API からメタデータを取得して付与する。

```bash
bun run crawler:enrich

# オプション
--hum-id {id}     # 特定の humId のみ処理
--force           # 既存エンリッチを上書き
--no-cache        # API キャッシュ無効化
--skip-datasets   # データセットエンリッチをスキップ
--skip-research   # 研究（DOI）エンリッチをスキップ
--delay-ms {n}    # API 呼び出し間隔（デフォルト 100ms）
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/` |
| 出力 | 同じディレクトリに上書き（in-place） |
| 処理内容 | Dataset: JGAD/DRA API から原始メタデータ、DDBJ Search API からリリース日付。Research: Crossref API で論文の DOI 検索。 |

### Step 6: llm-extract

Ollama LLM を使って実験データから構造化フィールド (searchable) を抽出する。

```bash
bun run crawler:llm-extract

# オプション
--file {id}       # 特定ファイルのみ処理
--hum-id {id}     # 特定の humId のみ処理
--dataset-id {id} # 特定の datasetId のみ処理
--model {name}    # Ollama モデル名
--concurrency {n} # LLM 並列呼び出し数（デフォルト 16）
--dry-run         # LLM 呼び出しなし
--force           # 既存フィールドを強制上書き
--latest-only     # 各データセット最新バージョンのみ処理（デフォルト）
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/dataset/` |
| 出力 | 同じディレクトリに上書き（in-place） |
| 処理内容 | 実験メタデータから検索可能フィールドを抽出。Idempotent（既に抽出済みの場合スキップ）。 |

詳細は [LLM フィールド抽出](./llm-extract-design.md) を参照。

### Step 7: icd10-normalize

疾患ラベルから ICD-10 コードを抽出・分離する。

```bash
bun run crawler:icd10-normalize

# オプション
--hum-id {id}   # 特定の humId のみ処理
--latest-only   # 最新バージョンのみ処理（デフォルト）
--dry-run       # 変更を適用せず試行
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/dataset/` |
| 出力 | 同じディレクトリに上書き（in-place） |
| 処理内容 | 疾患ラベルから ICD-10 コードを抽出。手動分割定義を適用。 |

### Step 8: facet-values

検索可能フィールドから一意の値を収集し、マッピング TSV を生成する。

```bash
bun run crawler:facet-values

# オプション
--latest-only  # 最新バージョンのみ処理（デフォルト）
--output {dir} # 出力ディレクトリ指定
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/dataset/` |
| 出力 | `src/crawler/data/facet-mappings/` 下の TSV ファイル |
| 処理内容 | 検索可能フィールドから一意の値を収集。既存 TSV は保存、新規値は `__PENDING__` マークで追加。 |

### Step 9: facet-normalize

TSV マッピングファイルを使用して searchable フィールド値を正規化する。

```bash
bun run crawler:facet-normalize

# オプション
--hum-id {id}      # 特定の humId のみ処理
--latest-only      # 最新バージョンのみ処理（デフォルト）
--dry-run          # 変更を適用せず試行
--mapping-dir {d}  # マッピングファイルディレクトリ指定
```

| 項目 | 内容 |
|------|------|
| 入力 | TSV マッピング + `crawler-results/structured-json/dataset/` |
| 出力 | 同じディレクトリに上書き（in-place） |
| 処理内容 | `__PENDING__` 値は未処理で使用。マッピングされない値の警告表示。 |

### Step 10: export-tsv

人間が確認・編集しやすい TSV 形式でエクスポートする。

```bash
bun run crawler:export-tsv

# オプション
--hum-id {id}  # 特定の humId のみエクスポート
--output {dir} # 出力ディレクトリ指定
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/structured-json/` |
| 出力 | `crawler-results/tsv/` |
| 処理内容 | structured-json を手動編集用 TSV 形式に変換。 |

詳細は [TSV ファイル編集ガイド](./tsv-docs.md) を参照。

### Step 11: import-tsv

編集した TSV を JSON に戻す。

```bash
bun run crawler:import-tsv
```

| 項目 | 内容 |
|------|------|
| 入力 | `crawler-results/tsv/` |
| 出力 | `crawler-results/structured-json/`（上書き） |
| 処理内容 | TSV の手動編集内容を structured-json に反映。編集可能フィールドのみ更新。rawHtml/policies などは保持。 |

## In-place 更新のステップ

以下のステップは `crawler-results/structured-json/` を直接更新する:

| ステップ | 更新内容 |
|---------|---------|
| Step 5: enrich | 外部 API メタデータ付与 |
| Step 6: llm-extract | searchable フィールド追加 |
| Step 7: icd10-normalize | diseases[].icd10 正規化 |
| Step 9: facet-normalize | assayType, tissues 等を正規化 |
| Step 11: import-tsv | TSV からの編集内容反映 |

## 部分実行

`--hum-id` オプションで特定の humId のみ処理できる:

```bash
# 特定の研究のみパイプライン全体を実行
bun run crawler:download-html --hum-id hum0001
bun run crawler:parse-html --hum-id hum0001
bun run crawler:normalize --hum-id hum0001
bun run crawler:structure --hum-id hum0001
bun run crawler:enrich --hum-id hum0001
bun run crawler:llm-extract --hum-id hum0001
bun run crawler:icd10-normalize --hum-id hum0001
bun run crawler:facet-normalize --hum-id hum0001
bun run crawler:export-tsv --hum-id hum0001
```

## 完全なパイプライン実行

```bash
# 全ステップを順番に実行
bun run crawler:download-html && \
bun run crawler:parse-html && \
bun run crawler:normalize && \
rm -rf crawler-results/structured-json/dataset/*.json && \
bun run crawler:structure && \
bun run crawler:enrich && \
bun run crawler:llm-extract && \
bun run crawler:icd10-normalize && \
bun run crawler:facet-values && \
bun run crawler:facet-normalize && \
bun run crawler:export-tsv
```

## トラブルシューティング

### 古い Dataset JSON が残っている

**症状**: ID が変更されたのに古い JSON が残り、ES にロードされる。

**対処**: Step 4 の前に `rm -rf crawler-results/structured-json/dataset/*.json` を実行。

### LLM 抽出がスキップされる

**症状**: `--force` なしだと既に抽出済みの実験がスキップされる。

**対処**: フィールドを追加した場合は `--force` で再抽出。

### ファセット値が正規化されない

**症状**: `__PENDING__` のまま ES にロードされる。

**対処**: `src/crawler/data/facet-mappings/*.tsv` を編集し、マッピングを追加。

### TSV 編集が反映されない

**症状**: TSV を編集したのに JSON に反映されない。

**対処**:
1. 編集不可フィールド（humId, datasetId など）を編集していないか確認
2. `import-tsv` 実行後に `es:load-docs` を実行
