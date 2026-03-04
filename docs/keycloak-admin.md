# Keycloak 管理設定

HumanDBs の Keycloak クライアント設定と管理者設定のガイド。

Backend の認証・認可設計は [architecture.md](../apps/backend/docs/architecture.md#認証認可) を参照。

## 外部サービス URL

### Cloakman（アカウント管理システム）

ユーザーがアカウントの作成・管理を行うシステム。ここで作成したアカウントが Keycloak に登録される。

| 環境 | URL |
|------|-----|
| Production | <https://accounts.ddbj.nig.ac.jp> |
| Staging | <https://accounts-staging.ddbj.nig.ac.jp> |

### Keycloak 管理コンソール

IdP の設定・管理を行う管理者向けコンソール。

| 環境 | URL |
|------|-----|
| Production | <https://idp.ddbj.nig.ac.jp> |
| Staging | <https://idp-staging.ddbj.nig.ac.jp> |

### テストアカウント

Staging 環境のテストアカウント情報は以下を参照（要アクセス権限）。

- <https://docs.google.com/document/d/1fJ7zrcjV_eNXz0e2KlEBod42m3XaqvJDni3zj6bTps8/preview>

## 環境変数

`.env` ファイルで以下の認証関連変数を設定する。

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `HUMANDBS_AUTH_ISSUER_URL` | OIDC Issuer URL（Keycloak の realm URL） | `https://idp-staging.ddbj.nig.ac.jp/realms/master` |
| `HUMANDBS_AUTH_CLIENT_ID` | OIDC クライアント ID | `humandbs-staging` |
| `HUMANDBS_AUTH_REDIRECT_URI` | 認証後のリダイレクト URI | `https://humandbs-staging.ddbj.nig.ac.jp/auth/callback` |
| `HUMANDBS_BACKEND_ADMIN_UID_FILE` | 管理者 UID リストのファイルパス（絶対パス） | `/app/admin_uids.json` |

### 環境別設定

| 環境 | ISSUER_URL | CLIENT_ID | REDIRECT_URI |
|------|------------|-----------|--------------|
| Development | `https://idp-staging.ddbj.nig.ac.jp/realms/master` | `humandbs-dev` | `http://localhost:8080/auth/callback` |
| Staging | `https://idp-staging.ddbj.nig.ac.jp/realms/master` | `humandbs-dev` | `https://humandbs-staging.ddbj.nig.ac.jp/auth/callback` |
| Production | `https://idp.ddbj.nig.ac.jp/realms/master` | `humandbs-production` | `https://humandbs.dbcls.jp/auth/callback` |

**注意:** Development と Staging は同じクライアント（`humandbs-dev`）を共有する。

## 管理者設定

管理者権限は Keycloak のロールではなく、`admin_uids.json` ファイルで管理する。

```bash
# テンプレートからコピー
cp admin_uids.template.json admin_uids.json
```

```json
[
  "user-uid-1",
  "user-uid-2"
]
```

**注意:** `admin_uids.json` は機密情報を含むため Git にコミットしないこと。

### scripts/fetch_keycloak_uid.sh

Keycloak のユーザー名/パスワードから UID（Keycloak の `sub` クレーム）を取得するスクリプト。

```bash
./scripts/fetch_keycloak_uid.sh           # UID を標準出力に表示
./scripts/fetch_keycloak_uid.sh --append  # UID を admin_uids.json に追記
./scripts/fetch_keycloak_uid.sh --help    # ヘルプ表示
```

**動作:**

1. `.env` から `HUMANDBS_AUTH_ISSUER_URL` と `HUMANDBS_AUTH_CLIENT_ID` を読み込む
2. ユーザー名・パスワードを対話的に入力
3. Resource Owner Password Credentials Grant でトークンを取得
4. JWT をデコードして `sub` クレーム（UID）を抽出

**依存:** `curl`, `jq`

### scripts/fetch_keycloak_credential.sh

Keycloak からアクセストークンを取得するスクリプト。API の手動テストに使用する。

```bash
# 対話形式でトークン取得
./scripts/fetch_keycloak_credential.sh

# 生のトークンのみ出力（スクリプト連携用）
./scripts/fetch_keycloak_credential.sh --format raw

# JWT ペイロードをデコードして表示
./scripts/fetch_keycloak_credential.sh --format decoded

# API リクエストで使用
TOKEN=$(./scripts/fetch_keycloak_credential.sh --format raw)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/research
```

**依存:** `curl`, `jq`

**詳細なテスト手順:** [apps/backend/tests/api-manual-testing.md](../apps/backend/tests/api-manual-testing.md) を参照。

## Keycloak クライアント設定

Keycloak 管理コンソールで HumanDBs 用のクライアントを作成する際の設定。
以下は `humandbs-dev` クライアント（Development / Staging 共用）の設定例。

### Settings タブ

#### General settings

| 項目 | 設定値 |
|------|--------|
| Client ID | `humandbs-dev` |
| Name | （空） |
| Description | （空） |
| Always display in UI | OFF |

#### Access settings

| 項目 | 設定値 |
|------|--------|
| Root URL | （空） |
| Home URL | （空） |
| Valid redirect URIs | `http://localhost:8080/auth/callback`<br>`https://humandbs-staging.ddbj.nig.ac.jp/auth/callback` |
| Valid post logout redirect URIs | `http://localhost:8080/*`<br>`https://humandbs-staging.ddbj.nig.ac.jp/*` |
| Web origins | `http://localhost:8080`<br>`https://humandbs-staging.ddbj.nig.ac.jp` |
| Admin URL | （空） |

#### Capability config

| 項目 | 設定値 | 説明 |
|------|--------|------|
| Client authentication | OFF | Public client（SPA 向け、client secret なし） |
| Authorization | OFF | 不要 |

#### Authentication flow

| 項目 | 設定値 | 説明 |
|------|--------|------|
| Standard flow | ON | Authorization Code Flow |
| Direct access grants | ON | Resource Owner Password Credentials Grant（スクリプト用） |
| Implicit flow | OFF | セキュリティ上の理由で無効 |
| Service accounts roles | OFF | 不要 |
| Standard Token Exchange | OFF | 不要 |
| OAuth 2.0 Device Authorization Grant | OFF | 不要 |
| OIDC CIBA Grant | OFF | 不要 |

#### PKCE Method

| 項目 | 設定値 | 説明 |
|------|--------|------|
| PKCE Method | `S256` | PKCE を強制（セキュリティ向上） |

#### Login settings

| 項目 | 設定値 |
|------|--------|
| Login theme | （デフォルト） |
| Consent required | OFF |
| Display client on screen | OFF |

#### Logout settings

| 項目 | 設定値 |
|------|--------|
| Front channel logout | ON |
| Front-channel logout session required | ON |

### Client scopes タブ

#### Audience Mapper の追加

Backend が JWT の `aud` クレームを検証するため、Audience mapper を追加する。

1. **Client scopes** タブを開く
2. **humandbs-dev-dedicated** をクリック
3. **Mappers** タブを開く
4. **Configure a new mapper** をクリック
5. **Audience** を選択
6. 以下を設定:

| 項目 | 設定値 |
|------|--------|
| Name | `audience` |
| Included Client Audience | `humandbs-dev` |
| Included Custom Audience | （空） |
| Add to ID token | OFF |
| Add to access token | ON |
| Add to token introspection | ON |

7. **Save** をクリック

### Advanced タブ

#### Advanced settings

| 項目 | 設定値（開発用） | 設定値（本番推奨） |
|------|------------------|-------------------|
| Access Token Lifespan | 1 Hours | 5 Minutes |
| Client Session Idle | 8 Hours | 30 Minutes |
| Client Session Max | 1 Days | 1 Hours |
| Client Offline Session Idle | 30 Days | 7 Days |

**注意:** 開発・テスト環境では長めの値を設定し、本番環境ではセキュリティ重視の短い値を推奨。
