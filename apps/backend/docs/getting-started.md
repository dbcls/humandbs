# Getting Started

Backend の開発を始めるための手順。

## 前提条件

- Docker 環境が起動していること（[README.md](../../../README.md) 参照）
- backend コンテナ内で作業すること

## 1. Elasticsearch の準備

```bash
# インデックス作成
bun run es:load-mappings

# ドキュメント投入（crawler でデータ生成後）
bun run es:load-docs
```

確認:

```bash
curl http://elasticsearch:9200/_cat/indices
```

## 2. API サーバーの起動

```bash
# 開発モード（ホットリロード）
bun run dev

# 本番モード
bun run start
```

確認:

```bash
# 開発環境（HUMANDBS_BACKEND_URL_PREFIX=/api）
curl http://localhost:8080/api/health
```

## 次のステップ

- クローラーを実行する場合: [crawler-pipeline.md](crawler-pipeline.md)
- API 仕様を確認する場合: [api-spec.md](api-spec.md)
