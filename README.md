# HumanDBs

NBDC ヒトデータベース (https://humandbs.dbcls.jp) のポータルである。研究とそれに属するデータセットの内容を admin が編集して公開し、公開ページ・検索・JSON API・データファイルの配信を提供する。

## 動かし方

手元で動かす手順は [docs/development.md](docs/development.md) にある。本番と staging の構成と手順は [docs/deployment.md](docs/deployment.md) にある。

## docs

上から順に読めば、どこに何があり、何をしてはいけないかが分かるように並べている。

| ファイル | 内容 |
|---|---|
| [docs/overview.md](docs/overview.md) | 全体像。構成要素、データの流れ、コードのどこに何があるか、ディレクトリ |
| [docs/concepts.md](docs/concepts.md) | 用語。研究・バージョン・下書き・データセット・ID などの意味と関係 |
| [docs/data-model.md](docs/data-model.md) | DB の構造と制約。研究の内容の保存形式、実体と ID、値の状態、項目定義と語彙、疾患 (ICD10)、検索用の行、外部から取ってきたデータ、日付 |
| [docs/editing.md](docs/editing.md) | 下書きの編集。同時編集と保存、取り込み、申請から研究を作る、レビュー |
| [docs/publishing.md](docs/publishing.md) | 公開。バージョン番号、公開前の確認、ID の割り当て、取り下げと削除、操作の記録 |
| [docs/files.md](docs/files.md) | データファイル。2 つの bucket と研究ごとの prefix、アップロード、公開と非公開の切り替え |
| [docs/site-content.md](docs/site-content.md) | 記事・お知らせ・アラート。本文の保存形式、slug とバージョン、表示の条件 |
| [docs/public-site.md](docs/public-site.md) | 公開サイトの仕様。URL と言語、何が公開されるか、検索式と絞り込み、書き出し、カート |
| [docs/public-api.md](docs/public-api.md) | 外部に互換性を保証している JSON API。応答の形、検索と一括取得、互換性、エラー、DDBJ Search への提供 |
| [docs/auth.md](docs/auth.md) | ログインと権限。誰が何をできるか、セッション、admin の追加と削除 |
| [docs/assistant.md](docs/assistant.md) | 申請支援アシスタントとポータルの境界 |
| [docs/development.md](docs/development.md) | 手元で動かす手順。初回、日常のコマンド、DB と schema の変更、開発用データ |
| [docs/testing.md](docs/testing.md) | テストの書き方。種類、何をテストにするか、mock の境界、テスト同士の独立 |
| [docs/deployment.md](docs/deployment.md) | 本番と staging を動かす手順。構成、`.env`、データの保存先、初回、更新、戻す、schema を変える、データを入れる |

## ライセンス

Apache License 2.0 ([LICENSE](LICENSE))。
