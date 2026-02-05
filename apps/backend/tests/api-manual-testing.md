# API 手動テスト（curl）

API エンドポイントの動作確認を curl で行う手順。

## 事前準備

### 1. Docker 環境起動

```bash
# プロジェクトルートで実行
docker compose up -d
```

### 2. 依存関係インストール（初回または volume リセット後）

```bash
docker compose exec backend bash -c 'cd /app && bun install'
```

### 3. ES ドキュメントロード（初回または volume リセット後）

```bash
docker compose exec backend bash -c 'cd /app/apps/backend && bun run es:load-mappings && bun run es:load-docs'
```

### 4. API サーバー起動

```bash
# バックグラウンドで起動
docker compose exec -d backend bash -c 'cd /app/apps/backend && bun run dev > /tmp/api.log 2>&1'

# 起動確認
sleep 5 && curl -s http://localhost:8080/api/health | jq
```

## 基本エンドポイント

```bash
# Health Check
curl -s http://localhost:8080/api/health | jq

# Stats
curl -s http://localhost:8080/api/stats | jq

# Facets（全フィールド）
curl -s http://localhost:8080/api/facets | jq 'keys'

# Facets（特定フィールド）
curl -s http://localhost:8080/api/facets/assayType | jq
```

## Research 読み取り系

```bash
# Research リスト
curl -s "http://localhost:8080/api/research?page=1&limit=5" | jq '.data[].humId'

# Research 詳細
curl -s http://localhost:8080/api/research/hum0001 | jq

# Research バージョン一覧
curl -s http://localhost:8080/api/research/hum0001/versions | jq

# Research 特定バージョン
curl -s http://localhost:8080/api/research/hum0001/versions/v1 | jq

# Research の Dataset 一覧
curl -s http://localhost:8080/api/research/hum0001/dataset | jq
```

## Dataset 読み取り系

```bash
# Dataset リスト
curl -s "http://localhost:8080/api/dataset?page=1&limit=5" | jq '.data[].datasetId'

# Dataset 詳細
curl -s http://localhost:8080/api/dataset/JGAD000001 | jq

# Dataset バージョン一覧
curl -s http://localhost:8080/api/dataset/JGAD000001/versions | jq

# Dataset 特定バージョン
curl -s http://localhost:8080/api/dataset/JGAD000001/versions/v1 | jq

# 親 Research 取得
curl -s http://localhost:8080/api/dataset/JGAD000001/research | jq
```

## 検索エンドポイント

```bash
# Research 検索（基本）
curl -s -X POST http://localhost:8080/api/research/search \
  -H "Content-Type: application/json" \
  -d '{"page":1,"limit":10,"lang":"ja","includeFacets":true}' | jq

# Dataset 検索（基本）
curl -s -X POST http://localhost:8080/api/dataset/search \
  -H "Content-Type: application/json" \
  -d '{"page":1,"limit":10,"lang":"ja","includeFacets":false}' | jq

# Research キーワード検索
curl -s -X POST http://localhost:8080/api/research/search \
  -H "Content-Type: application/json" \
  -d '{"page":1,"limit":10,"lang":"ja","query":"がん"}' | jq '.data[].title'

# Dataset フィルタ付き検索
curl -s -X POST http://localhost:8080/api/dataset/search \
  -H "Content-Type: application/json" \
  -d '{"page":1,"limit":10,"lang":"ja","filters":{"assayType":["WGS","WES"]}}' | jq '.data[] | {datasetId, assayType}'
```

## 異常系テスト

```bash
# 存在しない humId -> 404
curl -s http://localhost:8080/api/research/nonexistent | jq

# 存在しない datasetId -> 404
curl -s http://localhost:8080/api/dataset/nonexistent | jq

# 不正なページ番号 page=0 -> 400
curl -s "http://localhost:8080/api/research?page=0" | jq

# 不正なページ番号 page=-1 -> 400
curl -s "http://localhost:8080/api/research?page=-1" | jq

# 不正な limit=0 -> 400
curl -s "http://localhost:8080/api/research?limit=0" | jq

# 不正な limit=101 -> 400
curl -s "http://localhost:8080/api/research?limit=101" | jq
```

## 認証必要エンドポイント

```bash
# 認証なしで Research 作成 -> 401
curl -s -X POST http://localhost:8080/api/research/new \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# 認証なしで Admin 判定 -> 401
curl -s http://localhost:8080/api/admin/is-admin | jq
```

### 認証トークンの取得

Staging IdP からトークンを取得する。事前に `.env` に認証情報を設定しておく。

```bash
# .env に以下を設定（値は Keycloak のテストアカウント）
# HUMANDBS_AUTH_ISSUER_URL=https://idp-staging.ddbj.nig.ac.jp/realms/master
# HUMANDBS_AUTH_CLIENT_ID=humandbs-dev
# HUMANDBS_STAGING_USERNAME=<一般ユーザー名>
# HUMANDBS_STAGING_PASSWORD=<一般ユーザーパスワード>
# HUMANDBS_STAGING_ADMIN_USERNAME=<Admin ユーザー名>
# HUMANDBS_STAGING_ADMIN_PASSWORD=<Admin パスワード>

# .env を読み込み
source .env

# Token URL
TOKEN_URL="${HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/token"

# 一般ユーザーのトークン取得
USER_TOKEN=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$HUMANDBS_AUTH_CLIENT_ID" \
  -d "username=$HUMANDBS_STAGING_USERNAME" \
  -d "password=$HUMANDBS_STAGING_PASSWORD" | jq -r '.access_token')

# Admin ユーザーのトークン取得
ADMIN_TOKEN=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$HUMANDBS_AUTH_CLIENT_ID" \
  -d "username=$HUMANDBS_STAGING_ADMIN_USERNAME" \
  -d "password=$HUMANDBS_STAGING_ADMIN_PASSWORD" | jq -r '.access_token')

# 確認
echo "USER_TOKEN: ${USER_TOKEN:0:50}..."
echo "ADMIN_TOKEN: ${ADMIN_TOKEN:0:50}..."
```

**備考:** トークン取得スクリプト `scripts/fetch_keycloak_credential.sh` も利用可能。

### Admin 判定

```bash
# 一般ユーザー -> { "isAdmin": false }
curl -s -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:8080/api/admin/is-admin | jq

# Admin ユーザー -> { "isAdmin": true }
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8080/api/admin/is-admin | jq
```

### Research 作成（Admin のみ）

```bash
# Admin トークンで作成 -> 201
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":{"ja":"テスト研究","en":"Test Research"}}' \
  http://localhost:8080/api/research/new | jq

# 一般ユーザートークンで作成 -> 403
curl -s -X POST -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8080/api/research/new | jq
```

## 認証付きワークフローテスト

Research のライフサイクルをテストする。

```bash
# 1. Admin が Research 作成
HUM_ID=$(curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":{"ja":"ワークフローテスト","en":"Workflow Test"}}' \
  http://localhost:8080/api/research/new | jq -r '.humId')
echo "Created: $HUM_ID"

# 2. Admin が一般ユーザーを Owner として登録
# 注意: _seq_no と _primary_term は GET /research/{humId} から取得
RESEARCH=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8080/api/research/$HUM_ID")
SEQ_NO=$(echo "$RESEARCH" | jq -r '._seq_no')
PRIMARY_TERM=$(echo "$RESEARCH" | jq -r '._primary_term')
USER_UID="your-user-uid"  # JWT の sub クレームから取得

curl -s -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"uids\": [\"$USER_UID\"], \"_seq_no\": $SEQ_NO, \"_primary_term\": $PRIMARY_TERM}" \
  "http://localhost:8080/api/research/$HUM_ID/uids" | jq

# 3. Owner が Research 更新
RESEARCH=$(curl -s -H "Authorization: Bearer $USER_TOKEN" \
  "http://localhost:8080/api/research/$HUM_ID")
SEQ_NO=$(echo "$RESEARCH" | jq -r '._seq_no')
PRIMARY_TERM=$(echo "$RESEARCH" | jq -r '._primary_term')

curl -s -X PUT -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\": {\"ja\": \"更新済み\", \"en\": \"Updated\"}, \"_seq_no\": $SEQ_NO, \"_primary_term\": $PRIMARY_TERM}" \
  "http://localhost:8080/api/research/$HUM_ID/update" | jq

# 4. Owner が Dataset 作成
curl -s -X POST -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"criteria": "Controlled-access (Type I)"}' \
  "http://localhost:8080/api/research/$HUM_ID/dataset/new" | jq

# 5. Owner が submit (draft -> review)
curl -s -X POST -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8080/api/research/$HUM_ID/submit" | jq

# 6. Admin が approve (review -> published)
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8080/api/research/$HUM_ID/approve" | jq

# 7. Admin が unpublish (published -> draft)
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8080/api/research/$HUM_ID/unpublish" | jq

# 8. Admin が delete
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8080/api/research/$HUM_ID/delete"
echo "Deleted: $HUM_ID"
```

## 権限エラーテスト

```bash
# 認証なしで Admin 操作 -> 401
curl -s http://localhost:8080/api/admin/is-admin | jq

# 無効なトークン -> 401
curl -s -H "Authorization: Bearer invalid_token" \
  http://localhost:8080/api/admin/is-admin | jq

# 一般ユーザーが Admin 専用操作 -> 403
curl -s -X POST -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8080/api/research/new | jq

# Owner でないユーザーが更新 -> 403
# (Owner が設定されていない Research に対して)
curl -s -X PUT -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": {"ja": "不正", "en": "Unauthorized"}}' \
  "http://localhost:8080/api/research/hum0001/update" | jq
```

## 全エンドポイント一覧

### 認証不要（公開）- 13 個

| # | メソッド | パス | 説明 |
|---|----------|------|------|
| 1 | GET | /health | ヘルスチェック |
| 2 | GET | /stats | 統計情報 |
| 3 | GET | /facets | 全ファセット値 |
| 4 | GET | /facets/{fieldName} | 特定ファセット値 |
| 5 | GET | /research | Research リスト |
| 6 | GET | /research/{humId} | Research 詳細 |
| 7 | GET | /research/{humId}/versions | Research バージョンリスト |
| 8 | GET | /research/{humId}/versions/{version} | Research 特定バージョン |
| 9 | GET | /research/{humId}/dataset | リンク済み Dataset リスト |
| 10 | GET | /dataset | Dataset リスト |
| 11 | GET | /dataset/{datasetId} | Dataset 詳細 |
| 12 | GET | /dataset/{datasetId}/versions | Dataset バージョンリスト |
| 13 | GET | /dataset/{datasetId}/versions/{version} | Dataset 特定バージョン |

### 認証不要（検索）- 2 個

| # | メソッド | パス | 説明 |
|---|----------|------|------|
| 14 | POST | /research/search | Research 検索 |
| 15 | POST | /dataset/search | Dataset 検索 |

### 認証必要 - 14 個

| # | メソッド | パス | 説明 | 権限 |
|---|----------|------|------|------|
| 16 | GET | /dataset/{datasetId}/research | 親 Research 取得 | Optional |
| 17 | POST | /research/new | Research 作成 | Admin |
| 18 | PUT | /research/{humId}/update | Research 更新 | Owner/Admin |
| 19 | POST | /research/{humId}/delete | Research 削除 | Admin |
| 20 | POST | /research/{humId}/versions/new | 新バージョン作成 | Owner/Admin |
| 21 | POST | /research/{humId}/dataset/new | Dataset 作成 | Owner/Admin |
| 22 | POST | /research/{humId}/submit | レビュー提出 | Owner/Admin |
| 23 | POST | /research/{humId}/approve | 承認 | Admin |
| 24 | POST | /research/{humId}/reject | 却下 | Admin |
| 25 | POST | /research/{humId}/unpublish | 非公開化 | Admin |
| 26 | PUT | /research/{humId}/uids | UID 更新 | Admin |
| 27 | PUT | /dataset/{datasetId}/update | Dataset 更新 | Owner/Admin |
| 28 | POST | /dataset/{datasetId}/delete | Dataset 削除 | Admin |
| 29 | GET | /admin/is-admin | Admin 判定 | 認証必要 |
