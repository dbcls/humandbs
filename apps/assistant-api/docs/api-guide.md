# API ガイド

HumanDBs Assistant API の横断的な仕様と利用上の前提をまとめる。個別 endpoint の request/response schema は FastAPI が生成する OpenAPI を SSOT とし、本ガイドはそれを補完する。

## 1. このガイドの読み方

### SSOT の分担

| 観点 | SSOT |
|---|---|
| endpoint ごとの request body / response body / file upload shape | OpenAPI (`/openapi.json`) / Swagger UI (`/docs`) |
| 認証モデル、ジョブ状態、添付ファイルの扱い、運用上の前提 | 本ガイド |

### OpenAPI / Swagger UI

| 種類 | パス |
|---|---|
| Swagger UI | `/docs` |
| OpenAPI JSON | `/openapi.json` |

FastAPI 標準の Swagger UI を利用する。API 本体は `/api/*` に集約される。

## 2. アーキテクチャ概観

Assistant API は、申請書 PDF と任意添付資料を受け取り、バックグラウンド処理で YAML ベースの結果を更新する FastAPI サービスである。

- `uploads/` に申請書 PDF と任意添付を保存する
- `results/{task_id}.yml` に処理状態と評価結果を保存する
- 長時間処理は FastAPI `BackgroundTasks` で非同期に進める
- 取得系 endpoint は YAML を読んで現在状態を返す

### 主要リソース

| リソース | 説明 |
|---|---|
| Application | 1 件の申請処理単位。`task_id` で識別する |
| Attachment | 申請に付随する任意ファイル。現在は ethics file / research plan file |
| Handout | 完了済み申請から生成する配布用テキスト / Word 文書 |

## 3. 認証と認可

`src/app.py` では FastAPI アプリ全体に `Depends(require_admin)` を設定している。そのため、**すべての `/api/*` endpoint は admin 権限を要求する**。

### 認証フロー

- Bearer token を `Authorization` ヘッダーで送る
- `src/auth.py` が Keycloak JWKS で JWT を検証する
- `sub` が `admin_uids.json` に含まれている場合のみ admin と判定する

### 認可結果

| 条件 | 結果 |
|---|---|
| Bearer token なし | `401 Authentication required` |
| token 無効 / 期限切れ | `401 Invalid or expired token` |
| token は有効だが admin UID でない | `403 Admin access required` |
| token 有効かつ admin UID | API 呼び出し可 |

補足:

- admin 判定は OAuth scope ではなく、サーバー側の admin UID ファイルで行う
- OpenAPI には HTTP Bearer security scheme が出力される

## 4. ジョブライフサイクル

Assistant API は同期処理完了ではなく、`task_id` を返して後続取得で状態確認するモデルを採る。

### `POST /api/applications`

- 必須: `application_file`
- 任意: `ethics_file`, `research_plan_file`
- 受理時は `202 Accepted`
- レスポンスは `task_id` とメッセージ

### 状態遷移

| 状態 | 意味 |
|---|---|
| `processing` | バックグラウンド処理中 |
| `completed` | 評価結果が作成済み |
| `error` | `results/{task_id}_error.txt` が存在し、処理失敗 |

`GET /api/applications/{task_id}` は上記状態に応じてレスポンスを返す。YAML が存在しない場合は「まだ処理中」とみなされ、`processing` を返す。

## 5. エンドポイント分類

| 分類 | endpoint |
|---|---|
| 申請登録 | `POST /api/applications` |
| 状態取得 | `GET /api/applications/{task_id}` |
| 一覧取得 | `GET /api/applications` |
| 再解析 | `POST /api/applications/{task_id}/reanalyze`, `POST /api/applications/batch-reanalyze` |
| dataset 操作 | `POST /api/applications/{task_id}/add-datasets`, `POST /api/applications/{task_id}/remove-dataset` |
| 添付更新 | `POST /api/applications/{task_id}/attachments` |
| 成果物取得 | `GET /api/applications/{task_id}/handout`, `GET /api/applications/{task_id}/handout/word` |
| 元ファイル取得 | `GET /api/uploads/{filename}` |

## 6. ファイル取り扱い

### uploads

- 申請書本体は `uploads/{original_filename}` に保存する
- ethics file / research plan file は `src.utils` の命名規約ヘルパーで派生パスを決める

### results

- `results/{task_id}.yml` に作業状態を保存する
- 代表フィールド: `created_at`, `updated_at`, `filename`, `status`, `application_type`
- エラー時は `results/{task_id}_error.txt` を併用する

### 再解析時の前提

- `reanalyze` は既存 YAML の `filename` を元に元 PDF を再利用する
- YAML に `filename` が無い、または PDF が欠けている場合は `400` / `404` になる

## 7. 添付ファイル更新

`POST /api/applications/{task_id}/attachments` は既存申請に対して任意添付を差し替える。

- 対象の `task_id` が存在しない場合は `404`
- YAML に `filename` が無い場合は `400`
- `ethics_file` と `research_plan_file` の両方が空なら `400`
- 更新後は YAML の `updated_at` と添付パスを上書きする

## 8. エラー応答

主に FastAPI の `HTTPException` を利用しているため、エラー body は `{"detail": ...}` 形式になる。

| status | 主な発生条件 |
|---|---|
| `400` | 入力不足、未完了 handout 取得、添付なし更新 |
| `401` | 認証なし / token 不正 |
| `403` | admin 権限なし |
| `404` | task / file が見つからない |
| `500` | 申請処理・dataset 追加/削除中の予期しない例外 |

FastAPI の自動バリデーションエラーは `422 Unprocessable Entity` を返す。multipart 必須項目不足や request body 型不一致はここに入る。

## 9. テストと変更時の着眼点

- OpenAPI 上で全 endpoint が Bearer 認証付きで公開されていること
- `task_id` ベースのジョブ状態が `processing` / `completed` / `error` に分岐すること
- `src/auth.py` の 401 / 403 判定が壊れていないこと
- LLM や外部 API 呼び出しを伴う層は unit test では直接実行しないこと

関連するテスト方針は [tests/testing.md](../tests/testing.md) を参照。