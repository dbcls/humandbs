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

全体の開発環境セットアップはリポジトリルートの `README.md` を参照。この README は assistant-api 固有の補足に絞る。

## 開発環境で起動する

### 前提ファイル

- ルートの `.env`
  - `cp env.development .env`
- `apps/assistant-api/.env`
  - `apps/assistant-api/.env.example` を元に作成
- `apps/assistant-api/gcp-service-account.json`
  - Document AI などで使用する GCP サービスアカウント
- ルートの `admin_uids.json`
  - `admin_uids.template.json` を元に作成

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