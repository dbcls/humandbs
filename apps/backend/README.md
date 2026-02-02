# HumanDBs Backend

HumanDBs ポータルサイト (<https://humandbs.dbcls.jp/>) から研究データベース情報をクロールし、Elasticsearch に格納して REST API で公開する。

## クイックスタート

### 1. Docker 環境を起動

```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml exec backend bash
```

### 2. クローラーを実行

```bash
bun run crawler:download-html && \
bun run crawler:parse-html && \
bun run crawler:normalize && \
bun run crawler:structure && \
bun run crawler:enrich && \
bun run crawler:llm-extract
```

### 3. Elasticsearch にロード

```bash
bun run es:load-mappings
bun run es:load-docs
```

### 4. API サーバーを起動

```bash
bun run dev
```

API は `http://localhost:8080` で起動。Swagger UI は `http://localhost:8080/docs`。

## 開発コマンド

### クローラー

| コマンド | 説明 |
|---------|------|
| `bun run crawler:download-html` | HTML ダウンロード |
| `bun run crawler:parse-html` | HTML パース |
| `bun run crawler:normalize` | 正規化 |
| `bun run crawler:structure` | ja/en マージ、構造化 |
| `bun run crawler:enrich` | 外部 API メタデータ付与 |
| `bun run crawler:llm-extract` | LLM フィールド抽出 |
| `bun run crawler:icd10-normalize` | ICD-10 コード正規化 |
| `bun run crawler:facet-values` | ファセット値収集 |
| `bun run crawler:facet-normalize` | ファセット値正規化 |
| `bun run crawler:export-tsv` | TSV エクスポート |
| `bun run crawler:import-tsv` | TSV インポート |

### Elasticsearch

| コマンド | 説明 |
|---------|------|
| `bun run es:load-mappings` | マッピング作成 |
| `bun run es:load-docs` | ドキュメントロード |

### API / テスト

| コマンド | 説明 |
|---------|------|
| `bun run dev` | 開発サーバー起動 |
| `bun test` | ユニットテスト |
| `bun run typecheck` | 型チェック |
| `bun run lint --fix` | ESLint（自動修正） |

## ドキュメント

| ドキュメント | 内容 | こんなときに読む |
|------------|------|----------------|
| [クローラーパイプライン](docs/crawler-pipeline.md) | 11ステップの詳細、オプション | パイプライン実行方法を知りたい |
| [型システム](docs/type-system.md) | Crawler → ES → API のデータフロー | 新しいフィールドを追加したい |
| [Elasticsearch スキーマ](docs/elasticsearch-schema.md) | インデックス設計、クエリ例 | ES クエリを書きたい |
| [LLM フィールド抽出](docs/llm-extract-design.md) | searchable フィールドの抽出 | LLM 抽出を修正したい |
| [TSV 編集ガイド](docs/tsv-docs.md) | TSV ファイルの編集方法 | メタデータを手動編集したい |
| [API 仕様](docs/api-spec.md) | REST API エンドポイント | API を使いたい |
| [API アーキテクチャ](docs/api-architecture.md) | API 実装の設計 | API 実装を修正したい |

## ディレクトリ構造

```
src/
├── api/          # REST API サーバー (Hono + zod-openapi)
├── crawler/      # クローラー
│   ├── cli/      # CLI コマンド
│   ├── llm/      # Ollama LLM 統合
│   └── types/    # 型定義
└── es/           # Elasticsearch スクリプト

crawler-results/
├── html/              # Step 1 出力
├── detail-json/       # Step 2 出力
├── normalized-json/   # Step 3 出力
├── structured-json/   # Step 4-11 出力
└── tsv/               # Step 10 出力
```
