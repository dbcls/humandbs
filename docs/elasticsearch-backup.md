# Elasticsearch バックアップ・リストア

Elasticsearch の Snapshot API を使用したバックアップとリストアの手順。

## 前提条件

- Docker Compose 環境が起動していること
- `humandbs-es-backup` ディレクトリが作成されていること（Quick Start の手順参照）

## 設定概要

| 設定 | 値 |
|------|-----|
| コンテナ内リポジトリパス | `/usr/share/elasticsearch/backup` |
| ホスト側マウントパス | `${HUMANDBS_ES_BACKUP_PATH}` |

### 環境別バックアップパス

| 環境 | パス |
|------|------|
| development | `./humandbs-es-backup` |
| staging | `/home/w3humandbs-ac/humandbs-es-backup-staging` |
| production | `/home/w3humandbs/humandbs-es-backup` |

## バックアップ手順

### スクリプトを使用

```bash
# デフォルト名（snapshot_YYYYMMDD_HHMMSS）でスナップショット作成
./scripts/es_snapshot.sh

# 任意の名前を指定
./scripts/es_snapshot.sh -n my_snapshot

# ヘルプ
./scripts/es_snapshot.sh -h
```

スクリプトは以下を自動で行う:

- スナップショットリポジトリが未登録なら登録（冪等）
- 指定した名前でスナップショットを作成

### スナップショット一覧の確認

```bash
docker exec humandbs-development-elasticsearch curl -s "http://localhost:9200/_snapshot/backup_repo/_all?pretty"
```

### スナップショットの詳細確認

```bash
docker exec humandbs-development-elasticsearch curl -s "http://localhost:9200/_snapshot/backup_repo/snapshot_name?pretty"
```

**注意**: コンテナ名は `humandbs-${HUMANDBS_ENV}-elasticsearch` 形式で、`HUMANDBS_ENV` の値（`development` / `staging` / `production`）から決まる。

## リストア手順

### 1. リストア対象のインデックスを削除（必要に応じて）

既存のインデックスがある場合、同名のインデックスにはリストアできない。

```bash
# 特定のインデックスを削除
curl -X DELETE "http://localhost:9200/index_name"

# パターンで削除（危険：確認してから実行）
curl -X DELETE "http://localhost:9200/humandbs_*"
```

### 2. スナップショットからリストア

```bash
# 全インデックスをリストア
curl -X POST "http://localhost:9200/_snapshot/backup_repo/snapshot_name/_restore?wait_for_completion=true"
```

特定のインデックスのみリストアする場合：

```bash
curl -X POST "http://localhost:9200/_snapshot/backup_repo/snapshot_name/_restore?wait_for_completion=true" \
  -H "Content-Type: application/json" -d '{
  "indices": "humandbs_*",
  "ignore_unavailable": true,
  "include_global_state": false
}'
```

別名でリストアする場合：

```bash
curl -X POST "http://localhost:9200/_snapshot/backup_repo/snapshot_name/_restore?wait_for_completion=true" \
  -H "Content-Type: application/json" -d '{
  "indices": "original_index",
  "rename_pattern": "(.+)",
  "rename_replacement": "restored_$1"
}'
```

### 3. リストア状況の確認

```bash
curl -X GET "http://localhost:9200/_recovery?pretty"
```

## スナップショットの削除

```bash
curl -X DELETE "http://localhost:9200/_snapshot/backup_repo/snapshot_name"
```

## バックアップファイルの場所

スナップショットは `humandbs-es-backup/` ディレクトリに保存される。

```bash
# バックアップディレクトリの確認
ls -la humandbs-es-backup/
```

## トラブルシューティング

### リポジトリが見つからない

```plaintext
repository_missing_exception
```

→ スナップショットリポジトリが登録されていない。`./scripts/es_snapshot.sh` を使用すれば自動で登録される。

### リポジトリへの書き込み権限エラー

```plaintext
repository_verification_exception
```

→ `humandbs-es-backup` ディレクトリの権限を確認する。Elasticsearch コンテナ（UID 1000）が書き込めるようにする。

```bash
chmod 777 humandbs-es-backup
# または
sudo chown 1000:1000 humandbs-es-backup
```

### 同名のインデックスが存在する

```plaintext
snapshot_restore_exception
```

→ リストア前に既存のインデックスを削除するか、`rename_pattern` を使用する。

## Mapping 変更時の標準オペレーション

`apps/backend/src/es/*-schema.ts` のフィールド定義 (`keyword` ↔ `text` の切替、`bilingualTextKw` 化、`nested` の追加など) を変えた場合、ES は既存 index の mapping を後付けで変更できないため、対象 index を **削除して再作成 → データを再投入** する。`apps/backend/src/es/load-mappings.ts` は既存 index がある場合 skip するので、必ず先に DELETE すること。

以下の手順は `dataset` index を例にしたもの。`research` / `research-version` でも対象 index 名を差し替えて同じ流れになる。

```bash
# 0. 直前にスナップショットを取り、ロールバック手段を確保する
./scripts/es_snapshot.sh -n pre_mapping_change_$(date +%Y%m%d_%H%M%S)

# 1. 書き込みを止める (crawler / API の write path を停止 — staging は実害低、production は短時間メンテ枠)

# 2. 対象 index を削除
curl -X DELETE "http://localhost:9200/dataset"

# 3. 新スキーマで mapping を再作成
docker compose exec backend bun run src/es/load-mappings.ts

# 4. crawler-results/structured-json から再投入
docker compose exec backend bun run src/es/load-docs.ts

# 5. 動作確認 (例: 全文検索が想定どおりヒットするか)
curl 'http://localhost:3000/dataset/search?query=NGS&limit=5'
```

失敗した場合は手順 0 で取得したスナップショットからリストアできる (上記「リストア手順」を参照)。

## 参考リンク

- [Elasticsearch Snapshot and Restore](https://www.elastic.co/guide/en/elasticsearch/reference/current/snapshot-restore.html)
