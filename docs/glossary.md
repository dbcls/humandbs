# 用語集

同じ概念が公開ページの見出しにも public API の値にも facet のラベルにも語彙の ja ラベルにも出る。
v1 はこれを backend (定義域) と frontend (UI type) と localization (値のラベル) の 3 箇所に分けて
持っていて割れていたので、v2 は**訳語をここ 1 箇所に固定する**。

**ここにあるのは訳語であって画面の文言ではない。** ボタンのラベルや説明文は画面を書くときに決めて
`app/i18n/` に置く。この表が縛るのはドメインの語で、辞書も API の説明も facet のラベルも語彙の
ラベルもこの訳に従う。

英語表記はポータルが公開してきたものを引き継ぐ。出自は Joomla 版で、v1 はそれを写した層なので、
**両者が食い違うときは Joomla を採る** — `Representative` や `Targets` は v1 が独自に置き換えた語で、
読者が見てきた語ではない。ただし **v1 が正した誤りは戻さない**: Joomla は研究一覧で「アクセス制限」を
`Type of Data` と書き、参加者の列に `(Ethnicity)` を付けていた。`Unrestricted-access` のハイフンや
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
| 研究題目 | 研究題目 | Research title |
| 研究概要 | 研究概要 | Research overview |
| 目的 | 目的 | Aims |
| 研究方法 | 研究方法 | Methods |
| 対象 | 対象 | Participants/materials |
| リリースノート | リリースノート | Release note |
| 提供者 | 提供者 | Data provider |
| 研究代表者 | 研究代表者 | Principal investigator |
| 所属機関 | 所属機関 | Affiliation |
| 研究プロジェクト | 研究プロジェクト | Research project |
| 助成金 | 助成金情報 | Grants |
| 研究課題番号 | 研究課題番号 | Project number |
| 関連論文 | 関連論文 | Related publications |

**dataset の ID を並べる列は、どの表でも「データセット ID / Dataset ID」。** データセットの一覧、関連論文、
制限公開データの利用者一覧のどれでも、列はセルに入っているもの (dataset の ID) を名指し、それが何のための
ものかは節の名前が言う。同じものを表ごとに別の語で呼ぶと、別のものに読める。

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
| 国 | 国・州名 | Country/Region |
| データ利用期間 | データ利用期間 | Period of data use |
| ダウンロード | ダウンロード | Downloads |
| カバレッジ (深度) | カバレッジ (深度) | Coverage (depth) |
| カバレッジ (割合) | カバレッジ (割合) | Coverage (breadth) |

v1 の `Coverage` は深度 (`30x`) と割合 (`98%`) の 2 つの量を 1 つのキーに持っていたので、v2 は 2 つの
キーに割る ([data-model.md](data-model.md) の「catalog と語彙」)。どちらも v1 に無い新しい訳語なので、
ここで固定する。

## 日付

| 概念 | ja | en |
|---|---|---|
| 公開日 | 公開日 | Date published |
| 更新日 | 更新日 | Date modified |

v1 の dataset は「バージョン公開日 / Version release date」と「更新日付 / Modification date」も
出していたが、どちらも v2 に対応物が無い ([data-model.md](data-model.md) の「日付」)。

## 編集と公開

curator が見る語。**未確定と該当なしと未翻訳は preview にも出る**ので、提供者が読んで分かる語である
必要がある。**未確定だけは preview で赤い「ご教示ください」になる** — 提供者に見せる場所では状態の名前ではなく
依頼として読ませ、答えはその欄のコメントに書いてもらう ([editing.md](editing.md) の「レビュー」)。admin の
画面では「未確定」。

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

**alert は「アラート」で、「告知」「お知らせ」とは呼ばない** — 「お知らせ」は news の名前で、公開側も管理側も
同じ 1 文を同じ語で呼ぶ。

**`catalog` も `vocabulary` もモデル上の名前で、画面には出さない。** curator が口で言うのは「データセットが
解析手法の表を持つ」「表の key と値」で、値の候補を決まった集合から取る型が「選択肢」になる。仕様の側は
[data-model.md](data-model.md) の「catalog と語彙」がキー・語彙・語彙値と呼ぶ — **同じものの、読む人が
違う 2 通りの呼び方**で、`experiment` と「解析手法」の関係と同じ。

## facet のラベル

**この表には載せない。** 絞り込みの軸の名前は catalog のキーが両言語ぶんを 1 行で持っていて
([data-model.md](data-model.md) の「catalog と語彙」)、admin が編集する。この表が防ごうとしている
「同じ概念の訳が 2 か所にあって割れる」が構造的に起こらないので、写しを置くと SSOT が 2 つになる。
移行が入れる初期値は `migration/facets.ts`。

代わりに、そのラベルが従う規則をここに置く。

- **英語は sentence case。** 頭字語・固有名詞・単位は自身の綴りを保つ (`Disease (ICD-10)`)
- **見出しは単数。** 値が複数あることは軸の名前が言うことではない
- **値を列挙する軸は裸の名詞。** 真の boolean は「〜の有無」、二項の enum で名詞形では問いが伝わらない
  ものは値そのものを並べる (`腫瘍/非腫瘍`)。「〜の別」「〜の単位」のような関係名詞は使わない
- **単位はラベルに入れない。** 数値は打たれた単位のまま表示するので (`73 TB`)、正準単位を見出しに書くと
  見出しと値が食い違う。範囲の入力欄は自分の横に単位を出す
- **ja と en は同じ軸を指す。** 軸の意味を先に 1 回決めてから両方を書き起こす。訳ではなく、同じものの
  2 つの名前
- **括弧は中身がラテン文字・数字なら半角にし、直前に半角スペースを置く**
- **カタカナの長音符はサイト自身の表記に合わせる** (「ライブラリ」「リファレンス」)
- **v1 の語をそのまま引き継がない。** v1 は参照ゲノムを `Reference Sequence` (NCBI RefSeq の正式名と
  衝突する)、ライブラリ調製キットを `試薬` と書いていた。引き継ぐのは値として外部に出ている文字列だけで、
  軸の名前は v2 が決める

## 変えるとき

**訳語を変えるのはここを変えることであって、画面を直すことではない。** 表を直してから、辞書
(`app/i18n/`)・語彙の ja ラベル・facet のラベルを合わせる。逆向き — 画面で直した語がここに反映されない —
が v1 で起きた割れ方そのものなので、画面側から先に変えない。

**語彙値のラベルはこの表に載せない。** 語彙は admin が DB で編集するもので ([data-model.md](data-model.md)
の「catalog と語彙」)、doc に写しを置くと 2 つの SSOT ができる。ここに載せるのは、公開区分のように
**構造の側が意味を決めていて admin が言い換えてはいけない**語だけ。
