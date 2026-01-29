# JGA Shinsei PostgreSQL Container

JGA 申請システムの PostgreSQL ダンプを読み込む独立コンテナ環境。

## 前提条件

- Docker がインストールされていること
- ダンプファイルが `dumps/` に配置されていること

## ダンプファイル

| ファイル | 環境 |
|----------|------|
| `dumps/jgadb_staging_20250422.sql` | staging (約20GB) |

## 使用方法

### 1. 環境変数でダンプファイルを指定

```bash
cd apps/backend/jga-shinsei

# staging 環境のダンプを使用
export JGA_DB_FILE=jgadb_staging_20250422.sql
```

### 2. コンテナ起動

```bash
docker run -d \
  --name humandbs-jga-shinsei-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=jgadb \
  -e JGA_DB_FILE="${JGA_DB_FILE:-jgadb_staging_20250422.sql}" \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -p 127.0.0.1:5433:5432 \
  postgres:17 \
  -c shared_buffers=256MB \
  -c work_mem=64MB
```

**ポート**: `5433` を使用（既存の cms-db `5432` と衝突回避）

初回は 20GB のダンプインポートに時間がかかる（数十分〜数時間）。

### 3. インポート状況確認

```bash
docker logs -f humandbs-jga-shinsei-db
```

"Import completed!" が表示されたら完了。

### 4. PostgreSQL 接続

```bash
docker exec -it humandbs-jga-shinsei-db psql -U postgres -d jgadb
```

### 5. コンテナ停止・削除

```bash
docker stop humandbs-jga-shinsei-db && docker rm humandbs-jga-shinsei-db
```

## Scripts

**注意**: すべてのスクリプトはコンテナ `humandbs-jga-shinsei-db` が起動している必要がある。

### `scripts/list-tables.sh`

テーブル一覧（サイズ付き）を表示する。

```bash
./scripts/list-tables.sh
```

### `scripts/export-jga-relations.sh`

JGA ID 間の親子関係を JSON で出力する。

```bash
./scripts/export-jga-relations.sh
# Output: output/jga-id-relations.json
```

### `scripts/export-id-mappings.sh`

各種 ID マッピングを JSON で出力する。

```bash
./scripts/export-id-mappings.sh
# Output:
#   output/jga-hum-mapping.json   - JGA ↔ hum_id
#   output/jsub-jga-mapping.json  - JSUB ↔ JGA accession
#   output/jds-jga-mapping.json   - J-DS ↔ JGA accession
#   output/jdu-jgad-mapping.json  - J-DU ↔ JGAD
#   output/jsub-hum-mapping.json  - JSUB → hum_id
#   output/jsub-jds-mapping.json  - JSUB → J-DS (group_id 経由)
#   output/jsub-jdu-mapping.json  - JSUB → J-DU (JGAD 経由)
#   output/jsub-relations.json    - JSUB → hum_id, J-DS, J-DU (集約)
```

**jsub-relations.json の形式:**

```json
{
  "jsub_id": "JSUB000481",
  "hum_ids": ["hum00000"],
  "jds_ids": ["J-DS002504", "J-DS002520", "J-DS002527"],
  "jdu_ids": ["J-DU006529", "J-DU006530"]
}
```

### `scripts/query-metadata.sh`

各種 ID で metadata を検索する。

```bash
./scripts/query-metadata.sh jsub JSUB000481   # JSUB ID で検索
./scripts/query-metadata.sh hum hum0273       # hum_id で検索
./scripts/query-metadata.sh jds J-DS002504    # J-DS ID で検索
./scripts/query-metadata.sh jga JGAS000365    # JGA accession で検索
```

## ID の種類と関係

### JGA 系 ID

| プレフィックス | 種類 | 説明 |
|---------------|------|------|
| JGA | Submission | 登録単位 |
| JGAS | Study | 研究 |
| JGAD | Dataset | データセット |
| JGAN | Sample | サンプル |
| JGAX | Experiment | 実験 |
| JGAR | Data/Run | データファイル |
| JGAZ | Analysis | 解析結果 |
| JGAC | Center | センター |
| JGAP | Policy | ポリシー |
| JSUB | (内部) | 未公開の Submission ID |

### 外部 ID

| ID | 形式 | 説明 |
|----|------|------|
| J-DS | J-DS002xxx | Data Submission (データ提供申請) |
| J-DU | J-DU006xxx | Data Use (データ利用申請) |
| hum_id | humXXXX | NBDC 研究 ID |

### ID 間の関係

```
                          group_id
                       (subgrpXXXX)
                               |
               ---------------------------------
               |                               |
          submission                nbdc_application_master
               |                               |
             entry                           J-DS / J-DU
               |
            relation
               |
            accession  <---------------- metadata
               |
        -----------------
        |               |
   JGA accession       hum_id
    (alias: JSUB)
```

**主要な関係:**

| 関係 | 経路 | 説明 |
|------|------|------|
| JGA ID 間 | `relation` テーブル | JGAD ← JGAR ← JGAX などの親子関係 |
| JSUB ↔ JGA | `accession.alias` | JSUB は JGA accession の内部 alias |
| J-DS ↔ JGA | `group_id` 経由 | 同じ group に属する submission |
| J-DU ↔ JGAD | `use_permission` | データ利用申請 → Dataset |
| hum_id ↔ JGA | `metadata` XML | `nbdc_number` 属性 |

**JSUB と J-DS の関係:**

JSUB と J-DS は直接の関係を持たず、`group_id` を介して間接的に関連する:

- JSUB: `accession.alias` → `relation` → `entry` → `submission.group_id`
- J-DS: `nbdc_application_master.account_group` = `submission.group_id`

同じ研究グループ内で複数の JSUB (submission) と複数の J-DS (申請) が紐づく多対多の関係。

## Database Structure

### スキーマ

- `ts_jgasys` - メインスキーマ

### 確認コマンド

```sql
-- スキーマ一覧
\dn

-- テーブル一覧
\dt ts_jgasys.*

-- テーブル構造確認（例）
\d ts_jgasys.accession
```

## データ永続化

デフォルトではコンテナ削除時にデータも消える。データを永続化したい場合は、ボリュームを追加する:

```bash
docker run -d \
  --name humandbs-jga-shinsei-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=jgadb \
  -e JGA_DB_FILE="${JGA_DB_FILE:-jgadb_staging_20250422.sql}" \
  -v "$(pwd)/initdb":/docker-entrypoint-initdb.d:ro \
  -v "$(pwd)/dumps":/dumps:ro \
  -v humandbs-jga-shinsei-data:/var/lib/postgresql/data \
  -p 127.0.0.1:5433:5432 \
  postgres:17 \
  -c shared_buffers=256MB \
  -c work_mem=64MB
```
