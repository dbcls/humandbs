# HumanDBs

NBDC ヒトデータベース (https://humandbs.dbcls.jp) のポータル。研究とそれに属するデータセットの記述を
編集・公開し、公開ページ・公開検索・JSON API・データファイルの配信を提供する。

## docs

上から順に読めば、どこに何があり、何をしてはいけないかが分かる。

| ファイル | 中身 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 全体像。部品の受け持ち、データの流れ、何がどこに書いてあるか、ディレクトリ |
| [docs/data-model.md](docs/data-model.md) | 研究系のデータの持ち方。identity と label、版、言語と値の状態、文と数値、catalog と語彙、ICD10、公開表現、検索用の行、外部キャッシュ、日付 |
| [docs/files.md](docs/files.md) | ファイル。2 つの bucket と公開状態、upload、切り替えの job、データセットのファイル選択 |
| [docs/editing.md](docs/editing.md) | 書く側の不変条件。下書き、保存と同時編集、取り込み、申請から下書きを作る、レビューと共有リンク |
| [docs/publishing.md](docs/publishing.md) | 出す側の不変条件。版番号と更新、公開ゲート、label の pin、取り下げと削除、証跡 |
| [docs/site-content.md](docs/site-content.md) | 記事・お知らせ・アラート。持ち方、slug と版、公開日時、表示の条件 |
| [docs/public-site.md](docs/public-site.md) | 公開サイトの約束。アドレスと言語、公開の判定、検索式と絞り込みの意味、書き出し、カート |
| [docs/public-api.md](docs/public-api.md) | JSON API の外部契約。応答の形、検索と一括、エラー、DDBJ Search への供給 |
| [docs/auth.md](docs/auth.md) | 認証と認可。capability、セッション、admin の付け外し |
| [docs/assistant.md](docs/assistant.md) | 申請支援アシスタントとポータルの境界 |
| [docs/glossary.md](docs/glossary.md) | ドメインの語の ja / en の対。画面・API・facet が従う訳語 |
| [docs/testing.md](docs/testing.md) | テストの方針。階層、何を test にするか、mock の境界、独立性、e2e |
| [docs/development.md](docs/development.md) | 開発環境の手順。初回、日常のコマンド、DB、開発用データ、上流、ファイルストア、画面の規則の在処 |
| [docs/deployment.md](docs/deployment.md) | 配信の構成と手順。image と service、`.env`、データの置き場、schema の migration、初回・更新・戻す、本番データの移行 |

## ライセンス

Apache License 2.0 ([LICENSE](LICENSE))。
