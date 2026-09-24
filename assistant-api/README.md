# HumanDBs Assistant API

ポータルのサイドカーとして申請書 PDF を処理し、ポータルの proxy から呼ばれる API を提供する。構造化抽出と確認には Google GenAI、検索には Custom Search、OCR には Document AI、データセットのメタデータには公開 HumanDBs API を使う。

## テスト

### テストの実行方法

以下のコマンドを実行する。

```bash
docker compose exec assistant-api uv run --extra dev pytest
```

### 外部サービスを利用するチェック項目

一方、申請書の処理は入力内容と設定に応じて次のサービスへ接続する。

| 確認する機能 | 到達する外部サービス | 必要な設定 |
|---|---|---|
| 申請書・倫理審査書の構造化抽出、内容の検証 | Vertex AI の Google GenAI | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID`、必要に応じて `HUMANDBS_ASSISTANT_GOOGLE_GENAI_MODEL` |
| 研究者・所属・メールアドレス・電話番号・住所の確認 | Vertex AI の Google GenAI。Google Search または Google Maps grounding を使用する | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID` |
| PDF を OCR する処理 | Document AI | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID`、`HUMANDBS_ASSISTANT_DOCUMENT_AI_PROCESSOR_ID` |
| データセット情報の取得 | 同一 compose 内のポータル (`http://app:5173`) の公開 HumanDBs API | `assistant-api` と `app` を起動する |
| DRA の JGA study と HumanDBs ID の照合 | DDBJ Search API | 必要に応じて `HUMANDBS_ASSISTANT_DDBJ_SEARCH_API_BASE_URL` |
| DOI・PMID・論文タイトルからの研究情報の補完 | Crossref、PubMed、Europe PMC。タイトル検索時は Google Custom Search と検索結果の公開 Web ページ | `HUMANDBS_ASSISTANT_GOOGLE_CLOUD_API_KEY` と `HUMANDBS_ASSISTANT_GOOGLE_CSE_ID` (タイトル検索時) |

## Google Cloud

Google Cloud のサービスアカウント鍵を、このディレクトリ（assistant-api）の `gcp-credentials.json` に置く。サービスアカウントには Vertex AI User (`roles/aiplatform.user`) と Document AI API User (`roles/documentai.apiUser`) を付与する。

```bash
cp <service-account-key.json> assistant-api/gcp-credentials.json
```

compose はこのファイルを container 内の `/app/gcp-credentials.json` として読む。`gcp-credentials.json` は `.gitignore` により Git 管理から除外される。鍵の内容を `.env` や Git に置かない。

## Docker

Dockerfile がコード・テンプレート・データを焼き込んだイメージを作り、配信ではそのイメージで動く。開発では `compose.dev.yml` が `src/`・`templates/`・`data/`・`tests/` を bind mount するので、コードの変更はイメージを作り直さず `docker compose restart assistant-api` で反映される。依存 (`pyproject.toml` / `uv.lock`) を変えたときは `docker compose build assistant-api` で作り直す。
