# HumanDBs Backend

HumanDBs ポータルサイトから研究データベース情報をクロールし、Elasticsearch に格納して REST API で公開するシステム。

主な機能:

- **クローラー**: HumanDBs ポータルから HTML をダウンロードし、構造化データに変換 (11 ステップのパイプライン)
- **LLM 抽出**: Ollama を使って実験データから検索用メタデータを自動抽出
- **ES 投入**: 構造化データを Elasticsearch にロード
- **REST API**: Research / Dataset の検索・取得・管理 API (Hono + zod-openapi)

## ドキュメント

### はじめに

- [Getting Started](docs/getting-started.md) - 開発環境のセットアップ手順

### クローラー

- [クローラーパイプライン](docs/crawler-pipeline.md) - 11 ステップの詳細、CLI オプション
- [LLM フィールド抽出](docs/llm-extract-design.md) - searchable フィールドの抽出設計
- [ICD10 疾患正規化](docs/icd10-normalization.md) - ICD-10 コードの抽出・分離
- [TSV 編集ガイド](docs/tsv-editing-guide.md) - メタデータの手動編集方法

### API

- [API 仕様](docs/api-spec.md) - REST API エンドポイント一覧
- [API アーキテクチャ](docs/api-architecture.md) - 認可、ワークフロー、設計方針
- [検索機能仕様](docs/search_spec.md) - ファセット検索、フィルター仕様

### データ構造

- [型システム](docs/type-system.md) - Crawler -> ES -> API のデータフロー
- [Elasticsearch スキーマ](docs/elasticsearch-schema.md) - インデックス設計、クエリ例

### テスト

- [テストガイド](tests/testing.md) - テスト方針、構成、実行方法

## サブプロジェクト

- [joomla/](joomla/) - Joomla CMS の MySQL ダンプから menu/misc ページを JSON 抽出
- [jga-shinsei/](jga-shinsei/) - JGA 申請システムから ID 関係・申請情報を取得
