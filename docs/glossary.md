# 用語集

同じ概念が公開ページの見出しにも public API の値にも facet のラベルにも語彙の ja ラベルにも出る。
v1 はこれを backend (定義域) と frontend (UI type) と localization (値のラベル) の 3 箇所に分けて
持っていて割れていたので、v2 は**訳語をここ 1 箇所に固定する**。

**ここにあるのは訳語であって画面の文言ではない。** ボタンのラベルや説明文は画面を書くときに決めて
`app/i18n/` に置く。この表が縛るのはドメインの語で、辞書も API の説明も facet のラベルも語彙の
ラベルもこの訳に従う。

英語表記は v1 が公開してきたものをそのまま引き継ぐ。`Unrestricted-access` のハイフンや
`Controlled-access (Type I)` の括弧は、facet の値として外部に出ている文字列でもある。

## 対象と構造

| 概念 | ja | en |
|---|---|---|
| research | 研究 | Research |
| hum ラベル | 研究 ID | Research ID |
| research の版 | バージョン | Version |
| dataset | データセット | Dataset |
| dataset id | データセット ID | Dataset ID |
| experiment | 解析手法 | Analysis method |
| 研究概要 | 研究概要 | Research overview |
| 目的 | 目的 | Aims |
| 研究方法 | 研究方法 | Methods |
| 対象 | 対象 | Targets |
| リリースノート | リリースノート | Release note |
| 提供者 | 提供者 | Data provider |
| 代表者 | 代表者 | Representative |
| 所属機関 | 所属機関 | Organization |
| 研究プロジェクト | 研究プロジェクト | Research project |
| 助成金 | 助成金情報 | Grants |
| 研究課題番号 | 研究課題番号 | Project number |
| 関連論文 | 関連論文 | Related publications |

`experiment` はモデル上の名前で、画面には出さない。curator と読者が見るのは「解析手法 /
Analysis method」で、これは v1 が使っていた語。

## 公開区分とデータ

| 概念 | ja | en |
|---|---|---|
| 公開区分 | アクセス制限 | Access type |
| 非制限公開 | 非制限公開 | Unrestricted-access |
| 制限公開 (Type I) | 制限公開（Type I） | Controlled-access (Type I) |
| 制限公開 (Type II) | 制限公開（Type II） | Controlled-access (Type II) |
| データの種類 | データの種類 | Type of data |
| 制限公開データの利用者 (CAU) | 制限公開データの利用者一覧 | Controlled access users |
| データ利用期間 | データ利用期間 | Period of data use |
| ダウンロード | ダウンロードリンク | Download links |

## 日付

| 概念 | ja | en |
|---|---|---|
| 公開日 | 公開日 | Date published |
| 更新日 | 更新日 | Date modified |

v1 の dataset は「バージョン公開日 / Version release date」と「更新日付 / Modification date」も
出していたが、どちらも v2 に対応物が無い ([data-model.md](data-model.md) の「日付」)。

## 編集と公開

curator が見る語。**未確定と該当なしと未翻訳は preview にも出る**ので、提供者が読んで分かる語である
必要がある。

| 概念 | ja | en |
|---|---|---|
| draft | 下書き | Draft |
| 公開する | 公開 | Publish |
| 取り下げる | 取り下げ | Withdraw |
| 未確定 (unknown) | 未確定 | Unsettled |
| 該当なし | 該当なし | Not applicable |
| 未翻訳 | 未翻訳 | Untranslated |
| 共有リンク | 共有リンク | Share link |
| preview | プレビュー | Preview |
| 語彙 | 語彙 | Vocabulary |

## 変えるとき

**訳語を変えるのはここを変えることであって、画面を直すことではない。** 表を直してから、辞書
(`app/i18n/`)・語彙の ja ラベル・facet のラベルを合わせる。逆向き — 画面で直した語がここに反映されない —
が v1 で起きた割れ方そのものなので、画面側から先に変えない。

**語彙値のラベルはこの表に載せない。** 語彙は admin が DB で編集するもので ([data-model.md](data-model.md)
の「catalog と語彙」)、doc に写しを置くと 2 つの SSOT ができる。ここに載せるのは、公開区分のように
**構造の側が意味を決めていて admin が言い換えてはいけない**語だけ。
