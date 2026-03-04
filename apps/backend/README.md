# HumanDBs Backend

HumanDBs ポータルサイトから研究データベース情報をクロールし、Elasticsearch に格納して REST API で公開するシステム。

主な機能:

- **クローラー**: HumanDBs ポータルから HTML をダウンロードし、構造化データに変換 (11 ステップのパイプライン)
- **LLM 抽出**: Ollama を使って実験データから検索用メタデータを自動抽出
- **ES 投入**: 構造化データを Elasticsearch にロード
- **REST API**: Research / Dataset の検索・取得・管理 API (Hono + zod-openapi)

## ドキュメント

API ドキュメント (Swagger UI):

- Staging: <https://humandbs-staging.ddbj.nig.ac.jp/api/docs>
- Production: <https://humandbs.dbcls.jp/api/docs>

### 使い始める

- [Getting Started](docs/getting-started.md) - 環境のセットアップ手順

### API を使う (Frontend 開発者向け)

- [API ガイド](docs/api-guide.md) - 認可モデル、ワークフロー、検索の使い方

### データパイプラインを動かす

- [クローラーパイプライン](docs/crawler-pipeline.md) - 11 ステップの詳細、CLI オプション
- [LLM フィールド抽出](docs/llm-extract-design.md) - searchable フィールドの抽出設計
- [ICD10 疾患正規化](docs/icd10-normalization.md) - ICD-10 コードの抽出・分離
- [TSV 編集ガイド](docs/tsv-editing-guide.md) - メタデータの手動編集方法

### 設計を理解する (Backend 開発者向け)

- [アーキテクチャ](docs/architecture.md) - リソース関係、認可、ワークフロー、型システム設計
- [データモデル](docs/data-model.md) - ES スキーマ設計、型変換フロー

### 運用する

- [Keycloak 管理設定](../../docs/keycloak-admin.md) - Keycloak クライアント設定
- [ES バックアップ](../../docs/elasticsearch-backup.md) - バックアップ・リストア

### テスト

- [テストガイド](tests/testing.md) - テスト方針、構成、実行方法
- [API 手動テスト](tests/api-manual-testing.md) - curl での動作確認手順

## サブプロジェクト

- [joomla/](joomla/) - Joomla CMS の MySQL ダンプから menu/misc ページを JSON 抽出
- [jga-shinsei/](jga-shinsei/) - JGA 申請システムから ID 関係・申請情報を取得
