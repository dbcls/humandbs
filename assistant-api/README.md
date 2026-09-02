# HumanDBs Assistant API

開発用のサイドカーとして申請書 PDF を処理し、ポータルの proxy から呼ばれる API を提供する。構造化抽出には Azure OpenAI、確認には Google GenAI と Custom Search、OCR には Document AI、データセットのメタデータには公開 HumanDBs API を使う。

## テスト

以下のコマンドを実行する。

```bash
docker compose exec assistant-api uv run --extra dev pytest
```

## データ

ICD-10 の説明とローカルの研究メタデータには、`data/icd10_jp_mapping.json` と `data/hum_datasets/` が必要になる。サービスを起動する前に、アシスタント用データの配布元からこれらのプロジェクトデータを入手する。ICD-10 の対応表が無い場合は、起動時に警告を出す。

## Google Cloud

Google Cloud のサービスアカウント鍵を `gcp-credentials.json` に置く。サービスアカウントには Vertex AI User (`roles/aiplatform.user`) と Document AI API User (`roles/documentai.apiUser`) を付与する。

## Docker

Dockerfile は compose による開発環境を対象としている。compose はこのディレクトリを `/app` へ bind mount するため、配布用イメージは別途ビルド・設定する。