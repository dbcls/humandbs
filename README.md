# HumanDBs

NBDC ヒトデータベース (https://humandbs.dbcls.jp) のポータル。研究課題 (research) とそれに属する
データセット (dataset) の記述を編集・公開し、公開ページ・公開検索・JSON API・データファイルの配信を
提供する。

SSR する単一の React Router アプリで、server 実行点 (loader / action) から直接 Postgres を読む。
検索エンジンを別に置かず、全文検索と facet も同じ Postgres で完結する。データファイルは S3
(SeaweedFS) の 2 bucket に置き、公開かどうかはどちらの bucket に在籍しているかで表す。

## docs

| ファイル | 中身 |
|---|---|
| [docs/data-model.md](docs/data-model.md) | 何をどう持つか。identity と label、版と pin、公開表現、ファイル、外部キャッシュの不変条件 |
| [docs/public-pages.md](docs/public-pages.md) | 読者が見る画面。URL 体系、言語の載せ方、各ページに何を出すか、一覧と公開検索 |
| [docs/editing.md](docs/editing.md) | 編集から公開までの不変条件。draft、保存の単位、同時編集、巻き戻し、公開ゲート、レビュー、証跡 |
| [docs/auth.md](docs/auth.md) | 誰がサインインでき何を許されるか。capability、セッション、最初の admin |
| [docs/glossary.md](docs/glossary.md) | ドメインの語の ja/en 対。画面・API・facet・語彙が従う訳語 |
| [docs/testing.md](docs/testing.md) | テストの 5 階層。何を test にするか、mock の境界、e2e のシナリオ |
| [docs/development.md](docs/development.md) | 開発環境の手順。起動、lint と test、DB とファイルストアの触り方 |

## 動かす

[docs/development.md](docs/development.md) を参照。

## ライセンス

Apache License 2.0 ([LICENSE](LICENSE))。
