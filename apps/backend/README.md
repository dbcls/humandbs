# HumanDBs Backend

HumanDBs ポータルサイト (<https://humandbs.dbcls.jp/>) から研究データベース情報をクロールし、Elasticsearch に格納して REST API で公開するシステムの Backend 部分。

## 概要

このシステムは以下の機能を提供する:

1. **クローラー**: HumanDBs ポータルの HTML をダウンロード・パースして構造化データを生成
2. **Elasticsearch**: 構造化データを格納・検索
3. **REST API**: Hono + zod-openapi で型安全な API を提供

## セットアップ

### 前提条件

- Docker & Docker Compose
- Bun

### Docker 環境の起動

```bash
# 開発環境を起動（Elasticsearch, Ollama 含む）
docker compose -f compose.dev.yml up -d

# コンテナ内で作業
docker compose -f compose.dev.yml exec backend bash
```

### Ollama モデルの用意

LLM によるフィールド抽出を使用する場合:

```bash
docker compose -f compose.dev.yml exec ollama ollama pull qwen3:8b
```

## クローラー実行手順

クローラーはパイプライン形式で、以下の順序で実行する:

### 1. HTML ダウンロード

HumanDBs ポータルから HTML をダウンロードしてキャッシュする。

```bash
bun run crawler:download-html

# オプション
bun run crawler:download-html --hum-id hum0001  # 特定の humId のみ
bun run crawler:download-html --lang ja         # 日本語のみ
bun run crawler:download-html --force           # キャッシュを無視して再ダウンロード
bun run crawler:download-html --concurrency 8   # 並行数を指定
bun run crawler:download-html --verbose         # デバッグログを表示
```

出力: `crawler-results/html/`

### 2. HTML パース

HTML をパースして構造化データ (RawParseResult) を生成する。

```bash
bun run crawler:parse-html

# オプション
bun run crawler:parse-html --hum-id hum0001  # 特定の humId のみ
bun run crawler:parse-html --lang ja         # 日本語のみ
```

出力: `crawler-results/detail-json/` (RawParseResult)

### 3. 正規化

パース結果を正規化する（テキスト正規化、日付フォーマット、Dataset ID 処理など）。

```bash
bun run crawler:normalize

# オプション
bun run crawler:normalize --hum-id hum0001  # 特定の humId のみ
bun run crawler:normalize --lang ja         # 日本語のみ
```

出力: `crawler-results/normalized-json/` (NormalizedParseResult)

### 4. 構造化

正規化データから ja/en をマージし、Research / ResearchVersion / Dataset を生成する。

```bash
bun run crawler:structure

# オプション
bun run crawler:structure --hum-id hum0001  # 特定の humId のみ
```

出力: `crawler-results/structured-json/`
- `research/{humId}.json` (Research)
- `research-version/{humVersionId}.json` (ResearchVersion)
- `dataset/{datasetId}-{version}.json` (Dataset)

### 5. 外部 API データ付与

JGA/DRA/DOI API からメタデータを取得して付与する。

```bash
bun run crawler:enrich

# オプション
bun run crawler:enrich --hum-id hum0001
```

出力: `crawler-results/enriched-json/`

### 6. LLM フィールド抽出

Ollama を使って実験データから構造化フィールド (subjects, platforms, dataVolume) を抽出する。

```bash
bun run crawler:llm-extract

# オプション
bun run crawler:llm-extract --hum-id hum0001
```

出力: `crawler-results/extracted/`

### 7. TSV エクスポート

人間が確認・編集しやすい TSV 形式でエクスポートする。

```bash
bun run crawler:export-tsv
```

出力: `crawler-results/tsv/`

### 8. TSV インポート

編集した TSV を JSON に戻す。

```bash
bun run crawler:import-tsv
```

出力: `crawler-results/structured-json/` を更新

### 完全なパイプライン実行

```bash
# 全ステップを順番に実行
bun run crawler:download-html && \
bun run crawler:parse-html && \
bun run crawler:normalize && \
bun run crawler:structure && \
bun run crawler:enrich && \
bun run crawler:llm-extract && \
bun run crawler:export-tsv
```

## Elasticsearch

### マッピング作成とドキュメントロード

```bash
# マッピングを作成
bun run es:load-mappings

# ドキュメントをロード
bun run es:load-docs
```

### インデックス構造

| インデックス | ID 形式 | 内容 |
|------------|---------|------|
| `research` | `{humId}` | 研究の基本情報（バイリンガル） |
| `research-version` | `{humId}-{version}` | 各バージョンのリリース情報 |
| `dataset` | `{datasetId}-{version}` | データセット詳細 |

### インデックスの再作成

```bash
# インデックスを削除
curl -X DELETE "http://humandbs-elasticsearch-dev:9200/research,research-version,dataset"

# 再作成
bun run es:load-mappings
bun run es:load-docs
```

## API サーバー

### 起動

```bash
bun run dev
```

サーバーは `http://localhost:8080` で起動する。

### エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/researches` | 研究一覧（ページネーション対応） |
| GET | `/researches/{humId}` | 研究詳細 |
| GET | `/researches/{humId}/versions` | バージョン一覧 |
| GET | `/datasets` | データセット一覧 |
| GET | `/datasets/{datasetId}` | データセット詳細 |
| GET | `/datasets/{datasetId}/versions` | データセットバージョン一覧 |
| GET | `/health` | ヘルスチェック |
| GET | `/docs` | Swagger UI（OpenAPI ドキュメント） |

### OpenAPI ドキュメント

ブラウザで `http://localhost:8080/docs` を開くと Swagger UI で API 仕様を確認できる。

## ディレクトリ構造

```
src/
├── api/                  # REST API サーバー
│   ├── app.ts            # Hono アプリケーション
│   ├── es-client.ts      # Elasticsearch クライアント
│   └── routes/           # ルート定義
├── crawler/              # クローラー
│   ├── api/              # 外部 API クライアント (JGA, DRA, DOI)
│   ├── cli/              # CLI コマンド
│   ├── config/           # 設定 (URL, パターン, マッピング)
│   ├── data/             # JSON 設定ファイル
│   ├── llm/              # Ollama LLM 統合
│   ├── parsers/          # HTML パーサー
│   ├── processors/       # データ処理パイプライン
│   ├── types/            # 型定義
│   └── utils/            # ユーティリティ
└── es/                   # Elasticsearch スクリプト
```

## テスト

```bash
# ユニットテスト
bun test

# ウォッチモード
bun run test:watch

# 統合テスト
bun run test:integration

# 全テスト
bun run test:all
```

### テスト構造

```
tests/
├── unit/
│   └── crawler/
│       ├── config/
│       ├── parsers/
│       ├── processors/
│       └── utils/
└── integration/
```

## Lint & 型チェック

```bash
# ESLint
bun run lint
bun run lint --fix  # 自動修正

# TypeScript 型チェック
bun run typecheck
```

## トラブルシューティング

### よくある問題

#### Elasticsearch に接続できない

```bash
# コンテナが起動しているか確認
docker compose -f compose.dev.yml ps

# ログを確認
docker compose -f compose.dev.yml logs elasticsearch
```

#### LLM 抽出が動かない

```bash
# Ollama コンテナが起動しているか確認
docker compose -f compose.dev.yml ps ollama

# モデルがダウンロードされているか確認
docker compose -f compose.dev.yml exec ollama ollama list
```

#### パースエラーが発生する

一部の humId は HTML 構造が特殊で自動解析が困難なため、`config/mapping.ts` の `SKIP_PAGES` でスキップされている:

- MRI 関係: hum0031, hum0043, hum0235, hum0250
- 健康調査: hum0395, hum0396, hum0397, hum0398

### デバッグ

```bash
# verbose モードで実行
bun run crawler:download-html --verbose
bun run crawler:parse-html --verbose

# 特定の humId のみ処理
bun run crawler:parse-html --hum-id hum0001 --verbose
```

## 環境変数

| 変数名 | デフォルト | 説明 |
|--------|----------|------|
| `HUMANDBS_ES_HOST` | `http://humandbs-elasticsearch-dev:9200` | Elasticsearch ホスト |
