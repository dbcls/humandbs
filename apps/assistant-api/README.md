# HumanDBs Assistant API

申請ワークフローの支援を行う Python / FastAPI サブプロジェクト。申請書 PDF と添付資料を解析し、Web検索を伴うLLMを使って評価結果を生成する。

## 主な機能

- 申請書 PDF / 添付書類の抽出と構造化
- HumanDBs のデータセット情報取得
- 文献・研究者情報の補助調査
- LLM を使った申請内容の評価とレポート生成

## リポジトリ内での位置づけ
- Compose サービス名: `assistant-api`
- コンテナ内ポート: `8000`
- ホスト公開ポート: `3001`
- Frontend からは `http://assistant-api:8000/api` を経由して利用する

## `.env` の `ASSISTANT_` 環境変数

リポジトリルートの `.env` では、Assistant API 向けの設定を `ASSISTANT_` プレフィックス付きで定義する。

設定項目は以下のとおり。

| `.env` の変数名 | コンテナ内の変数名 | 説明 |
| --- | --- | --- |
| `ASSISTANT_AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_API_KEY` | Azure OpenAI の API キー。 |
| `ASSISTANT_AZURE_OPENAI_ENDPOINT` | `AZURE_OPENAI_ENDPOINT` | Azure OpenAI リソースのエンドポイント URL。 |
| `ASSISTANT_OPENAI_API_VERSION` | `OPENAI_API_VERSION` | Azure OpenAI に接続するときの API バージョン。 |
| `ASSISTANT_AZURE_OPENAI_MODEL` | `AZURE_OPENAI_MODEL` | 利用する Azure OpenAI デプロイメント名。`gpt-5` を含む名前なら GPT-5 向け設定で初期化される。 |
| `ASSISTANT_LLM_TEMPERATURE` | `LLM_TEMPERATURE` | OpenAI / Gemini 呼び出し時の temperature。再現性を優先するなら `0` にする。 |
| `ASSISTANT_DEPLOY_MODE` | `DEPLOY_MODE` | `development` のとき、レポート用テンプレートを毎回再読み込みする。 |
| `ASSISTANT_LOG_LEVEL` | `LOG_LEVEL` | タスクごとのログ出力レベル。`INFO`、`DEBUG` などを指定する。 |
| `ASSISTANT_GOOGLE_CLOUD_API_KEY` | `GOOGLE_CLOUD_API_KEY` | Google Custom Search API や Google Maps 系の補助処理で使う API キー。 |
| `ASSISTANT_GOOGLE_CLOUD_PROJECT_ID` | `GOOGLE_CLOUD_PROJECT_ID` | Vertex AI / Document AI の GCP プロジェクト ID。 |
| `ASSISTANT_GOOGLE_CSE_ID` | `GOOGLE_CSE_ID` | Google Custom Search Engine の検索エンジン ID。 |
| `ASSISTANT_GOOGLE_GENAI_CACHE_ENABLED` | `GOOGLE_GENAI_CACHE_ENABLED` | Gemini 応答キャッシュを有効化するかどうか。`true` / `false` で指定する。 |
| `ASSISTANT_GOOGLE_GENAI_CACHE_DIR` | `GOOGLE_GENAI_CACHE_DIR` | Gemini 応答キャッシュの保存先ディレクトリ。 |
| `ASSISTANT_PLAYWRIGHT_CACHE_TTL_SECONDS` | `PLAYWRIGHT_CACHE_TTL_SECONDS` | Playwright で取得した Web / PDF 内容のキャッシュ有効秒数。`0` 以下でキャッシュ無効。 |
| `ASSISTANT_PLAYWRIGHT_CACHE_DIR` | `PLAYWRIGHT_CACHE_DIR` | Playwright キャッシュの保存先ディレクトリ。 |
| `ASSISTANT_DOCUMENT_AI_LOCATION` | `DOCUMENT_AI_LOCATION` | Google Document AI プロセッサのリージョン。通常は `us` などを指定する。 |
| `ASSISTANT_DOCUMENT_AI_PROCESSOR_ID` | `DOCUMENT_AI_PROCESSOR_ID` | PDF OCR に使う Document AI Processor の ID。 |
| `ASSISTANT_INVESTIGATE_RESEARCHER_HISTORY` | `INVESTIGATE_RESEARCHER_HISTORY` | `true` のとき、申請者の研究者履歴調査を追加実行する。 |
| `ASSISTANT_HUMANDBS_WEB_BASE_URL` | `HUMANDBS_WEB_BASE_URL` | HumanDBs 公開サイトのベース URL。レポート内リンク生成などで使う。 |
| `ASSISTANT_DDBJ_SEARCH_API_BASE_URL` | `DDBJ_SEARCH_API_BASE_URL` | DDBJ の JGA dataset search API ベース URL。 |
| `ASSISTANT_HUMANDBS_BACKEND_ADMIN_UID_FILE` | なし | 現在の `compose.yml` では未使用。assistant-api コンテナ内では `/workspace/humandbs-assistant/admin_uids.json` が固定で設定され、ルートの `admin_uids.json` が bind mount される。 |

補足:

- Document AI / Vertex AI の認証は API キーではなく、`apps/assistant-api/gcp-service-account.json` を `GOOGLE_APPLICATION_CREDENTIALS` としてマウントして行う。
- `.env` を変更した後は、必要に応じて assistant-api コンテナを再起動して反映する。

## キャッシュを削除する

LLM 応答キャッシュを消して再評価したい場合は、`apps/assis1tant-api` で次を実行する。

```bash
rm -f langchain_cache.db
rm -rf google_genai_cache
```

必要ならその後にリポジトリルートで再起動する。

```bash
docker compose up -d assistant-api
```