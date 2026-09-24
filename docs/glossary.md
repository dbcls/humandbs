# 用語集

ドメインの語の ja / en の対。同じ概念が公開ページの見出しにも JSON API の値にも facet のラベルにも出る
ので、**訳語はここ 1 か所に固定し、画面の辞書 (`app/i18n/messages.ts`)・API の説明・語彙のラベルはこれに
従う。** ボタンの語や説明文のような画面の文言はここに載せない (`messages.ts` が持つ)。

**英語表記はポータルが公開してきたものを引き継ぐ。** `Unrestricted-access` のハイフンや
`Controlled-access (Type I)` の括弧は、facet の値として外に出ている文字列でもあるので変えない。

## 対象と構造

| 概念 | ja | en |
|---|---|---|
| research | 研究 | Research |
| hum ラベル | 研究 ID | Research ID |
| research の版 | バージョン | Version |
| dataset | データセット | Dataset |
| dataset id | データセット ID | Dataset ID |
| experiment | 解析手法 | Analysis method |
| 研究題目 | 研究題目 | Research title |
| 研究概要 | 研究概要 | Research overview |
| 目的 | 目的 | Aims |
| 研究方法 | 研究方法 | Methods |
| 対象 | 対象 | Participants/materials |
| リリースノート | リリースノート | Release note |
| 提供者 | 提供者 | Data provider |
| 研究代表者 | 研究代表者 | Principal investigator |
| 所属機関 | 所属機関 | Affiliation |
| 研究プロジェクト | 研究プロジェクト情報 | Research project |
| 助成金 | 助成金情報 | Grants |
| 研究課題番号 | 研究課題番号 | Project number |
| 関連論文 | 関連論文 | Related publications |

**データセットの ID を並べる列は、どの表でも「データセット ID / Dataset ID」。** 何のための ID かは節の
名前が言う。`experiment` はモデル上の名前で、画面には「解析手法 / Analysis method」として出る。

## 公開区分とデータ

| 概念 | ja | en |
|---|---|---|
| 公開区分 | アクセス制限 | Access type |
| 非制限公開 | 非制限公開 | Unrestricted-access |
| 制限公開 (Type I) | 制限公開（Type I） | Controlled-access (Type I) |
| 制限公開 (Type II) | 制限公開（Type II） | Controlled-access (Type II) |
| データの種類 | データの種類 | Type of data |
| 制限公開データの利用者 (CAU) | 制限公開データの利用者一覧 | Controlled access users |
| 国 | 国・州名 | Country/Region |
| データ利用期間 | データ利用期間 | Period of data use |
| ダウンロード | ダウンロード | Downloads |
| カバレッジ (深度) | カバレッジ (深度) | Coverage (depth) |
| カバレッジ (割合) | カバレッジ (割合) | Coverage (breadth) |
| 公開日 | 公開日 | Date published |
| 更新日 | 更新日 | Date modified |

## 編集と公開

curator が見る語。**未確定・該当なし・未翻訳は preview にも出る**ので、提供者が読んで分かる語である
必要がある。**未確定だけは preview で「ご教示ください」になる** — 提供者には状態の名前ではなく依頼として
読ませ、答えはその欄のコメントに書いてもらう。

| 概念 | ja | en |
|---|---|---|
| draft | 下書き | Draft |
| 公開する | 公開 | Publish |
| 取り下げる | 取り下げ | Withdraw |
| 未確定 (unknown) | 未確定 (preview では「ご教示ください」) | Unsettled (preview: Please let us know) |
| 該当なし | 該当なし | Not applicable |
| 未翻訳 | 未翻訳 | Untranslated |
| 共有リンク | 共有リンク | Share link |
| preview | プレビュー | Preview |
| 閲覧者の印: コメントを書き終えた | コメントを書き終えました。事務局に確認をお願いします | I have finished commenting. Please review my comments |
| 閲覧者の印: 修正の必要は無い | 修正の必要はありません。この内容で問題ありません | No corrections are needed. The content is fine as it is |
| catalog のキー | key | Key |
| 語彙値 | 値 | Value |
| 語彙型 | 選択肢 | Choice |
| alert (全ページの上部の 1 文) | アラート | Announcement |
| news | お知らせ | News |

**alert は「アラート」で、「告知」「お知らせ」とは呼ばない** — 「お知らせ」は news の名前。**news は公開側
でも「お知らせ」** で、en は `News`。**「上流」は画面に出さない** — curator が読むのは、申請管理システム
由来なら「データ提供申請」、DDBJ Search 由来なら「外部アクセッション」(管理画面の語なので ja だけ)。**「管理」は区画の名前に使わない** (JGA 申請管理システムと紛れる)。区画は「Admin」。

**`catalog` も `vocabulary` もモデル上の名前で、画面には出さない。** 画面の語は key・値・選択肢。仕様の
側 ([data-model.md](data-model.md)) はキー・語彙・語彙値と呼ぶ — 読む人が違う 2 通りの呼び方で、
`experiment` と「解析手法」の関係と同じ。

## facet のラベル

**絞り込みの軸の名前はこの表に載せない。** catalog のキーが両言語を 1 行で持ち、admin が編集する
([data-model.md](data-model.md))。写しを置くと SSOT が 2 つになる。初期値は移行が入れる
(`migration/facets.ts`)。代わりにラベルが従う規則をここに置く。

- **英語は sentence case。** 頭字語・固有名詞・単位は自身の綴りを保つ (`Disease (ICD-10)`)
- **見出しは単数。** 値を列挙する軸は裸の名詞、真の boolean は「〜の有無」、二項で名詞にならないものは
  値を並べる (`腫瘍/非腫瘍`)。「〜の別」「〜の単位」は使わない
- **単位はラベルに入れない。** 数値は打たれた単位で表示するので、見出しと値が食い違う
- **軸の語は、公開ページでその値を出している表の見出しと同じ。** 軸のための別の言い回しを持たない
- **ja と en は同じ軸の 2 つの名前。** 軸の意味を先に決めてから両方を書く
- **括弧は中身がラテン文字・数字なら半角で、前に半角スペース。** カタカナの長音符はサイトの表記に合わせる
  (「ライブラリ」「リファレンス」)

## 変えるとき

**訳語を変えるのはここを変えることで、画面を直すことではない。** 表を直してから、辞書・語彙の ja ラベル・
facet のラベルを合わせる。画面の側から先に変えると、訳が 2 か所に割れる。**語彙値のラベルはここに
載せない** — admin が DB で編集するもので、載せるのは公開区分のように構造が意味を決めていて admin が
言い換えてはいけない語だけ。
