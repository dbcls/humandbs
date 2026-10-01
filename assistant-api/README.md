# HumanDBs Assistant API

ポータルのサイドカーとして申請書 PDF を処理し、ポータルの proxy から呼ばれる API を提供する。構造化抽出と確認には Google GenAI、検索には Custom Search、OCR には Document AI、データセットのメタデータには公開 HumanDBs API を使う。

## テスト

### テストの実行方法

以下のコマンドを実行する。

```bash
docker compose exec assistant-api uv run --extra dev pytest
```

### 外部サービスを利用するチェック項目

申請書の処理は、入力内容と設定に応じて次の外部サービスに接続する。

| 確認する機能                                       | 到達する外部サービス                                                                            | 必要な設定                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 申請書・倫理審査書の構造化抽出、内容の検証         | Vertex AI の Google GenAI                                                                       | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID`、必要に応じて `HUMANDBS_ASSISTANT_GOOGLE_GENAI_MODEL` |
| 研究者・所属・メールアドレス・電話番号・住所の確認 | Vertex AI の Google GenAI。Google Search または Google Maps grounding を使用する                | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID`                                                       |
| PDF を OCR する処理                                | Document AI                                                                                     | `gcp-credentials.json`、`HUMANDBS_ASSISTANT_GOOGLE_CLOUD_PROJECT_ID`、`HUMANDBS_ASSISTANT_DOCUMENT_AI_PROCESSOR_ID`        |
| データセット情報の取得                             | 同一 compose 内のポータル (`http://app:5173`) の公開 HumanDBs API                               | `assistant-api` と `app` を起動する                                                                                        |
| DRA の JGA study と HumanDBs ID の照合             | DDBJ Search API                                                                                 | 必要に応じて `HUMANDBS_ASSISTANT_DDBJ_SEARCH_API_BASE_URL`                                                                 |
| DOI・PMID・論文タイトルからの研究情報の補完        | Crossref、PubMed、Europe PMC。タイトル検索時は Google Custom Search と検索結果の公開 Web ページ | `HUMANDBS_ASSISTANT_GOOGLE_CLOUD_API_KEY` と `HUMANDBS_ASSISTANT_GOOGLE_CSE_ID` (タイトル検索時)                           |

## Google Cloud

Google Cloud のサービスアカウント鍵を、このディレクトリ（assistant-api）の `gcp-credentials.json` にコピーする。サービスアカウントには Vertex AI User (`roles/aiplatform.user`) と Document AI API User (`roles/documentai.apiUser`) を付与する。

```bash
cp <service-account-key.json> assistant-api/gcp-credentials.json
```

compose はこのファイルを container 内の `/app/gcp-credentials.json` として読む。`gcp-credentials.json` は `.gitignore` により Git 管理から除外される。鍵の内容を `.env` や Git に書かない。

## Docker

Dockerfile がコード・テンプレート・データを含めたイメージを作り、配信ではそのイメージで動く。開発では `compose.dev.yml` が `src/`・`templates/`・`data/`・`tests/` を bind mount するので、コードの変更はイメージを作り直さず `docker compose restart assistant-api` で反映される。依存 (`pyproject.toml` / `uv.lock`) を変えたときは `docker compose build assistant-api` で作り直す。

## 配信先で動かす

配信先 (rootless podman + podman-compose 1.0.6) では、配信の dir (`compose.yml` のある dir) で次のコマンドを実行する。どれも assistant-api の container だけを作り直すか止めるもので、ポータル (app・proxy・DB・ファイルストア) は止まらない。`<project>` は配信の dir の名前で、container は `<project>_assistant-api_1`、申請書と解析結果を保存する volume は `<project>_assistant-work` になる。

ポータルの `.env` の `HUMANDBS_ASSISTANT_ORIGIN` は `http://assistant-api:8000` にしておく。この変数だけはポータルの app が読むもので、変えるとポータルの作り直しが要る。assistant-api が止まっているあいだは、管理画面に動いていないことが表示される。

### 設定を変えて起動し直す

`.env` の `HUMANDBS_ASSISTANT_*` を書き換えたあとに実行する。初めて起動するときも同じで、先に `gcp-credentials.json` をコピーしておく (「Google Cloud」)。

```bash
podman-compose up -d --force-recreate assistant-api
```

### コードを更新して起動し直す

`data/` はイメージに含まれるので、`data/` を変えたときもこの手順で反映する。

```bash
git pull --ff-only
podman-compose build assistant-api
podman-compose up -d --force-recreate assistant-api
```

`git pull` ではポータルのコードも更新されるが、ポータルに反映されるのは次のポータルの更新 (`scripts/deploy.sh`) のときである。ポータルの更新は、assistant-api が起動していればそのイメージも作り直す。

### 止める

```bash
podman-compose down assistant-api
```

container を削除するので、ポータルの更新でも起動しない。`podman-compose stop` で止めただけだと container が残り、次のポータルの更新で起動し直される。volume は残るので、起動し直せば申請書と解析結果はそのまま使える。解析結果も消すときは、続けて `podman volume rm <project>_assistant-work` を実行する。

### 別の環境の work/ を取り込む

別の環境で動かしていたアシスタントの `work/` (`uploads/`・`results/`・`logs/`) を、起動している container にコピーする。ファイルの所有者は container の中のユーザーに合わせられる。申請の一覧はリクエストのたびにファイルから読むので、コピーしたあとに起動し直さなくてよい。

```bash
podman cp <work のコピー>/. <project>_assistant-api_1:/app/work/
```

### 使わないコマンド

- `podman-compose up -d` (サービス名なし): `.env` を変えたあとだと、ポータルの DB・ファイルストア・app・proxy まで止めて作り直す
- `podman-compose restart assistant-api`: 古い設定のまま再起動し、`.env` の変更が反映されない
- `podman-compose down` (サービス名なし): ポータルごと止まる
- `--profile assistant`: podman-compose 1.0.6 はこのオプションを知らないのでエラーになる (`compose.yml` の `profiles` も無視される)
