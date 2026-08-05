# データモデル

Postgres が唯一の store で、編集中のものと公開済みのものを両方持つ。別の検索エンジンに投影しない。
派生値は計算ロジックの側が SSOT で、値はいつでも作り直せる。

ファイルだけは第 2 のストア (S3) にあり、公開状態もそちら側が持つ。

```
Postgres
  research / experiment / dataset    identity + content + draft + pin ledger
  site content                       document / news / navigation / alert
  review                             comments (the share link is a draft column)
  external cache                     CAU / hum-to-accession / accession dates
  event                              append-only
  search rows                        full-text columns + facet rows (published only)
        |
        +-- loader / action --> SSR pages / editing / preview
        +-- resource route   --> public JSON API
        |
        v
S3 (SeaweedFS)
  public bucket / private bucket      membership IS the published state
  data files + assets referenced from article bodies
```

schema は `app/db/schema/`、content の型は `app/content/types.ts`。schema が固まるまで migration
file を持たず、`npm run db:push` が定義をそのまま DB に反映する。変えたら開発用データを作り直す。

## content と行

**content はすべて JSONB で持つ。** research content も、dataset content (experiment の列と値スロットを
含む) も、draft の変更エントリも、その派生元のスナップショットも。**published と draft で表現を変えない**
ので、公開は値のコピー、3-way 差分は同じ型どうしの比較で済む。

値スロットを列に割らないのは、**どの列が有効かが catalog の型に依存する**ため。翻訳対は ja/en、数値は
正準単位の値と入力単位、語彙は語彙値の id を持ち、どれが埋まるかはキーの型で決まる。列に割ると NULL
許容の列が並んで整合を schema で保証できないが、JSONB なら値の型の側で「数値スロットに ja/en は無い」を
落とせる。

行にするのは次の 5 つで、どれも content ではない。

| 行 | なぜ行なのか |
|---|---|
| 検索用の行 | facet を集計し、全文検索の index を張る |
| pin 台帳 | ラベルの一意性を DB の制約として守る |
| catalog と語彙 | キーの型の SSOT で、語彙値への参照整合性が要る |
| 外部キャッシュ | バッチが書き換える。curator の編集対象ではない |
| event・コメント・job | 追記されるもの |

**experiment は dataset content の中の順序つきの要素**で、独立した行ではない。identity はその要素が
持つ代理キーで、コメントの宛先と一括編集の対象はこの id で指す。集計のために行にする必要は無い —
facet も全文検索も検索用の行が公開分だけを別に持つ。

## identity と label

内部の同一性と、外に見せる名前を混ぜない。research と dataset は抽象的な identity を持ち、**hum
ラベル・公開版番号・dataset id はそこに後から pin する label**。label が無くてもオブジェクトを作れ、
label が変わっても参照が壊れない。

ラベルの一意性の規則は 3 系統で共通だが、置き場は形の違いで分かれる。

| ラベル | 置き場 | 一意性 |
|---|---|---|
| hum ラベル / dataset id | `label_pin` | 種別と文字列で全体に一意 |
| 公開版番号 | `research_version` | research の中で一意。公開状態を併せ持つ |

守る不変条件:

- **可視性は公開状態にある版の集合から判定し、版番号の大小比較で行わない。** 番号に gap があると
  `v1..latest` の列挙は未公開の版を素通しする
- **pin を外したラベルは再利用できる。欠番を作る規則を持たない。** hum 番号は JGA 申請管理システムに
  人手で入力される自由文字列が起点で typo の実績があるため、訂正は日常の操作になる
- **公開実績のあるラベルを別の identity に付け替えるときは admin に警告を出す。** 止めはしないが、
  外部からのリンクが黙って別物を指すので黙って通しもしない
- **dataset id はパースしない。** 値の構造に意味を読み込まない

**1 つの identity に複数の id が pin される。1 つが primary で、残りが secondary。** primary と
secondary を合わせて台帳で一意で、上の規則はどちらにも同じく適用される。旧 id への外部参照を解決し
続けるための仕組み。primary が identity ごとに 1 つであることは部分 unique index が守る。

台帳に載る時期は 2 系統で違う。**hum ラベルは research identity に付き、draft 段階でも台帳を占有する**
(research は draft の親なので、draft が何本あっても hum は 1 つ)。**dataset id が台帳に載るのは公開時**で、
draft が新規に追加した dataset の identity は draft と運命を共にする。同じ accession の dataset を
2 つの draft が別々に追加した場合、公開の時点で既存の identity があればそちらに寄せる。

## research / experiment / dataset

```
Research (identity)                    <- hum label pinned in the ledger
|
+-- ResearchVersion (number)  --> ContentSnapshot (immutable)
|     published versions only            body + ordered list of dataset identities
|
+-- ResearchDraft (mutable)            <- unpublished working copy; several allowed
|     +-- content
|     +-- note                            admin only; never reaches preview
|     +-- parent (ContentSnapshot)        detects "derived from a stale snapshot"
|     +-- change entries                  copy-on-write for touched datasets
|     +-- new dataset identities          enter the ledger on publish
|
+-- Dataset (identity)                 <- dataset id pinned in the ledger
      +-- content (JSONB)              <- experiments live in here, ordered
```

**dataset は versioning しない。履歴も持たない。** identity と、公開されている content を 1 つ持つ。
dataset の実体 (アーカイブに登録されたデータ) は不変で、変わるのは記述の訂正・充実・表記統一なので、
最新が正しい。

**ContentSnapshot が持つのは dataset identity の順序つき列だけで、experiment の集合も順序も持たない。**
したがって過去版を開くと、dataset の一覧は当時のもの、各 dataset の記述と experiment の一覧は最新になる。
版を公開した後にその dataset へ追加された experiment も、過去版から辿った dataset のページに出る。

**experiment は dataset content の中にあり、関係は 1 dataset : n experiment。** dataset ごとに違う値は
experiment の値スロットが持つので、どの dataset の experiment かは従属関係そのものが表す。experiment に
版は持たせない。

**dataset は 1 つの research に従属する (composition)。** 複数 research から参照される dataset は無い。

判定はすべて 1 つの根拠に閉じる。

| 判定 | 根拠 |
|---|---|
| dataset が公開されているか | `dataset_content` に行があるか |
| research の過去版から辿れるか | その版の ContentSnapshot が持つ dataset identity の列に入っているか |
| experiment が公開画面に出るか | 属する dataset が出ているか |
| 検索用の行に載るか | 公開版が参照しているもの |

**どの公開版からも参照されなくなった dataset (孤児) は削除しない。** identity の行は残り、公開 content の
行だけが消えるので、公開ページには出ず管理画面から復旧できる。research 自体を削除したときだけ、
composition に従って配下の dataset も消える。

**research 版のページには experiment を出さない。** dataset の一覧を出し、experiment は dataset のページで
見る。

## 言語

**公開の単位は research の版であって言語ではない。** ContentSnapshot は ja/en を一体で持つ。版は
「その時点の研究の姿」であり、翻訳は同じ姿の別表現なので、言語で割れると版の意味が壊れる。

**片言語が未翻訳のまま公開できる。** 英語版がそもそも存在しない研究が実在するので禁止は採れない。
代わりに公開ゲートが未翻訳を列挙して確認させる ([editing.md](editing.md))。

**未翻訳は欠損ではなく状態として扱い、値から導出する。** 翻訳対の field で片方の言語に値があって
もう片方が空なら未翻訳。両方空は未入力、該当なしは別の状態。フラグを別に持たないので実態とずれない。

field は 3 種に分かれ、**分類は content の型が持つ** (`app/content/types.ts`)。一覧としてこの doc に
持たない。

| 分類 | 基準 | 翻訳状態 |
|---|---|---|
| 言語を持たない単一値 | 原典が 1 つの表記しか持たない (数値・語彙値・accession・論文タイトル) | 持たない |
| 翻訳対 | 言語ごとに正しい表記が存在する (本文・要約・機関名・研究課題名) | 持つ |
| 言語ごとに別の値 | 対応する外部リソースが言語ごとに別に存在する。**URL だけ** | 持たない |

**単一値から翻訳対への拡張は機械的に行える。これを不変条件として持つ。** 片方の言語に同じ値をコピー
するだけで判断が要らないので、迷う field は単一値に寄せてよい。逆向きは ja/en のどちらを採るかの判断を
伴う。ただし**コピーで埋めた側は未翻訳として立てる** — 埋めた結果を翻訳済みと見なしてはいけない。

## 値スロットの状態

値スロットは 3 つの状態を持ち、キーの不在を合わせて 4 通りの見え方になる。

| 状態 | 意味 | 公開画面 | 検索・facet | preview |
|---|---|---|---|---|
| 値あり | | 値を出す | 載せる | 載せる |
| キーの不在 | その項目がその実験では話題にならない | 項目ごと出さない | 載せない | 出さない |
| unknown | 値があるはずだが確定していない | 出さない | 載せない | 状態を出す |
| 該当なし | 値が存在しないことが確定している | 項目を出し、該当なしを表す表示を置く | 載せない | 状態を出す |

unknown と該当なしの違いは、解決されるべきかどうか。unknown は公開前に潰す対象で、該当なしは確定した
情報なので公開ゲートの列挙に載らない。

**該当なしの表示文字列は値として持たない。** 状態として持ち、表示は描画側で生成する。値として書かせると、
該当なしの表明と、表を使い回したときの埋め草が文字列から区別できなくなる。**該当なしは言語をまたいで
1 つ**で、翻訳状態の対象にしない。

名前つきの field を持つ research content と違い、dataset と experiment の値は catalog のキーの下に付く。
どちらの値スロットも同じ型で、状態の扱いも同じ。

## catalog と語彙

dataset と experiment の値スロットのキーは catalog (`content_key`) が持ち、統制語彙の安定した id を
identity とする。catalog は表示ラベル (ja/en)・値の型・表示順を持つ。

- **キーは dataset に付くか experiment に付くかの scope を持つ。** 公開区分やデータ種別は dataset の値、
  分子データの記述は experiment の値で、どちらも同じ形のスロットになる
- **rename は表示ラベルの変更であり、データに伝播しない**
- **表示順は catalog が持つ。** データから復元できるグローバルな順序は存在しない
- **数値型のキーは正準単位と、入力で選べる単位の集合を持つ。** 保存の時点で正準単位へ換算し、
  **入力で選ばれた単位は換算後も残す** — 換算を後から直すときに元の入力が要る
- **キーの追加は明示的な操作。** 一致しない文字列を打った拍子に catalog へ登録される経路を持たない
- **併合は値の一致だけで判定しない。** 同一 experiment 内での共起衝突を検査する

**キーの型が facet を決める。** 型が語彙・数値のキーが facet の source になり、それ以外は自由文。
したがって**キーの型を変えることが facet を増やす操作**で、そこだけが開発の作業になる。キーの追加・
rename・並び替えと、facet のカテゴリと並びは admin の操作。

語彙値のラベルは **en 必須・ja 任意**。日本語表記の要否は facet 単位では決まらない (同じ facet の中に
`メチル化アレイ` と `WGS` が同居する) ので、ja が空であることは欠損ではなく、公開ゲートの未翻訳の
列挙にも載せない。

**語彙は原則フラット。階層を持つのは ICD10 だけ。** 3 桁を選んだときに配下の 4 桁もヒットする必要が
あるので木を持たせる。**語彙値は出所を持ち、外部標準由来は読み取り専用**。出所を持たないと、手修正が
次の取り込みで黙って消える。

## 公開表現

**公開表現は content から純関数で作り、経路を 1 本に保つ。** 公開ページも共有リンクの preview も同じ
関数の出力を受け取る。違いは未確定値を残すかどうかの引数だけで、公開ページ側の経路にこの引数は届かない。

**入力は content だけではない。** content に加えて、外部キャッシュ (CAU と外部 accession の日付) と、
ストアの箱の list (ダウンロード一覧) を取る。**関数はこの 3 つを引数に取り、外部を自分で叩かない** —
叩くと外部の可用性が描画に直結する。

**公開表現は content の形を変えない。落とすことしかしない。** field 名を変えず、構造を平坦化せず、値の
表現も変えない。content 由来の部分については **content ⊃ 公開表現**で、content は公開表現に編集時だけ
要る情報 (翻訳状態、revision) が足されたもの。

| 経路 | 受け取るもの | 公開表現との差 |
|---|---|---|
| 公開ページ (research 系) | 公開表現 | — |
| 共有リンクの preview | 公開表現 | 未確定値のスロットが残る |
| admin の編集画面 | content | + 翻訳状態・revision・draft のメモ |
| 公開ページ (サイトコンテンツ) | content | 適用外。版も pin も持たない |

## 検索用の行

公開検索と facet が読む行を Postgres の中に持つ。**編集用の content から導出したもので、公開分しか
持たない。**

**何が公開されているかの判定をここ 1 つに閉じる。** 公開画面・public API・公開検索は、対象の集合をこの
行からしか引かない。本文そのものは ContentSnapshot と `dataset_content` から取るが、これらは**公開時に
しか行が生まれない**テーブルで、編集中の値は draft 配下の変更エントリに入る。編集用と公開用が同じ DB に
同居する以上、担保は物理的な分離ではなくこの 2 点で作る。

持つのは 3 種類。全文検索の列を持つ行 (`search_doc`)、語彙 facet の行、数値 facet の行。

- **公開操作と同じトランザクションで更新する。** 「反映されていない」という状態が存在しない
- **外部キャッシュの更新も同じ扱い。** 日次バッチがキャッシュを書き換えたら、影響する行を同じ
  トランザクションで作り直す
- **行が消える経路も 1 つに畳む。** 版の取り下げも research の削除も孤児も、専用の処理を持たず
  「公開分を作り直す」の結果として消える
- **全件再作成を常用の手段として持つ。** 検索用の行の作り方を変えたときも、catalog や語彙を触った
  ときも、まるごと作り直す
- **語彙値の表示ラベルは焼かない。** catalog を join して引く
- **ICD10 のロールアップは祖先の id の列で効かせる。** 3 桁を選ぶと配下の 4 桁がヒットする

**全文検索の列は ja と en を連結した生成列**で、直接書き込めない。索引は PGroonga の n-gram
(`TokenNgram` の `unify_*` を全て false、`NormalizerNFKC150`) で、形態素解析を採らないのは
`JGAD000123` の語中一致と `糖尿病` の部分一致がどちらも要るため。**全文検索の述語は
`WITH ... AS MATERIALIZED` に閉じ込める** — 素直に書くとプランナが述語を nested loop の内側に落として
1 行ずつ再評価する。

## ファイル

**ファイルは帰属を持たない。** upload / download と公開・非公開の切り替えができるストアとして持ち、
research・dataset・document への従属関係をモデルに持たせない。本文からの参照は URL 文字列で張られる
だけで、その参照関係を維持する仕組みは持たない。

**実体は S3 の 2 bucket に置き、公開状態は bucket の在籍そのもの。** Postgres に公開状態を持たない。
bucket を分けるのは **prefix 単位の grant が効かない**ため。公開を表現できるのは anonymous identity への
grant だけで、bucket policy も object ACL も anonymous には効かない。

| bucket | key | 読み手 |
|---|---|---|
| 非公開 | `{researchId}/{ファイル名}` | admin のみ。server 側が presigned URL で渡す |
| 公開 (`files`) | `hum{NNNN}/{ファイル名}` | anonymous。前段の proxy が `/files/` をそのまま渡す |

非公開側が identity なのは、**ファイルの受け入れが hum の pin より前に起きる**ため。公開側が hum なのは、
path-style の URL が `/files/hum0009/hum0009.v1.CpG.v1.zip` となって公開済みの download URL と構造ごと
一致し、anonymous の download に解決を挟まずに済むため。公開操作は CopyObject + DeleteObject で、
**ファイル名は変えない**。hum に属さない記事 asset は `common/` の箱に置き、公開 bucket 固定になる。

守る不変条件:

- **同じ (research, ファイル名) の組が 2 つの bucket に同時に存在しない。** 切り替えは原子的でないので
  途中で落ちると両方に居るが、それは公開状態ではなく未完了で、job の retry が解消する。**job ごと
  失った状態で両方に居るものが見つかったら、公開側を残して非公開側を消す**
- **filer と master と S3 API の port を直接公開しない。** filer の HTTP は完全に無認証で、非公開
  bucket の一覧と本文をそのまま返す。配信は必ず前段の proxy を通す
- **前段で `X-Content-Type-Options: nosniff` を付け、画像と PDF 以外は `Content-Disposition: attachment`
  にする。** ストアは Content-Type 未指定のファイルの中身から MIME を推測するので、HTML を含むファイルが
  同じ origin で inline render される経路を塞ぐ。**upload 時は Content-Type を明示する**
- **切り替えのコストはファイルサイズに比例する。** CopyObject は実体のバイトコピーなので、公開状態の
  切り替えは job にして公開操作を待たせない

**Postgres が持つのは実行待ちの job だけ。** job を失っても矛盾は生まれない — ファイルは公開のままか
非公開のままかのどちらかに留まる。誰がいつ切り替えたかは event に残る。

**dataset は箱の list に対する選択を持てる。** 自分が属する hum の箱の list に現れるノードを順序つきで
0 個以上選ぶ。これが「この dataset のデータはこれ」の注記になり、dataset content の中に入る。

- **選択は存在を主張しない。** 源は箱の list 1 本だけで、list に無いものは表示されない
- **ダウンロード一覧の導出には使わない。** 一覧は箱の機械 list のままで、選択はその上の注記に留まる
- **ファイル側は何も知らない。** 1 ファイルが複数 dataset から選ばれてよい
- **外部 accession の dataset には持たせない。** distribution はアーカイブから取る経路のまま

**どこからも参照されなくなったこと (orphan) を機械的に判定できないので、orphan の検出はしない。**
ファイルは本文中の URL 文字列と上の選択からしか参照されず、外部サイトからの直接参照もありうる。
棚卸しが要るときは admin が手で見る。

## 外部キャッシュ

外部 master から取った値は Postgres のキャッシュテーブルに置き、読み手はそこから読む。

| 対象 | source | 用途 |
|---|---|---|
| CAU (controlled-access user) | JGA 申請管理システム DB | 公開表現に載る |
| hum ラベル ↔ dataset accession | 同上 | 公開ゲートの検算 |
| 外部 accession の日付 | DDBJ Search | 公開表現に載る |

- **上流が止まっても公開ページは動く。** バッチが書き、読み手はキャッシュしか見ない
- **キャッシュなので失っても再取得でき、バックアップの対象外**
- **取得に失敗したら前回値を残す。** 上流が一時的に応答しないことと、値を消したことを区別できない
- **CAU は content ではないので翻訳状態を持たない。** 上流の ja/en をそのまま出し、公開ゲートの
  未翻訳の列挙にも載せない。curator が編集できない値なので、直す経路は上流側にある
- **CAU の 1 行は 1 利用課題。** 人単位に丸めない (上流に person master が無く、名寄せが推測になる)。
  出すのは PI だけで、hum ラベルに紐づく
- **hum と accession は 1 : n。** 上流がこの対応の master で、ポータルは検算と DDBJ Search への供給に使う

## 日付

**日付は admin が設定するものとして持つ。** 版を変えずに fix するので、操作の記録をそのまま日付にすると
公開の実態を表せない。

| 日付 | 決め方 |
|---|---|
| research の版の release date | 公開操作時に today を default で入れ、admin が変更できる |
| research の初公開日 / 最終公開日 | 公開版の release date から導出する。独立に持たない |
| dataset の公開日 / 更新日 | 外部 accession はアーカイブ側の値をそのまま出し、それ以外は admin が設定する |

**書式は `YYYY-MM-DD`。暦日は JST で切る。日付は言語を持たない。** アーカイブ由来の日付をポータル側で
補正しない — 補正すると上流が直ったときに二重の推定が残る。ポータルの content がいつ訂正されたかを表す
値はどこにも持たない。

## サイトコンテンツ

**document と news は版も pin も持たない。draft と公開状態だけを持つ。** research の版・pin 台帳・fix は
適用せず、公開表現の純関数の対象にも公開検索の対象にもならない。

- **locale ごとに content と公開状態を持つ。** 版を持たないので「公開の単位は版であって言語ではない」が
  当てはまらない
- **news は document と別のエンティティ。** identity + locale ごとの content + 公開日 + draft
- **ガイドラインの過去版も独立した document として持つ。** 各版は全文を持つ自己完結した本文
- **「最新」を指す機構を持ち、admin が設定する。** 版なし slug が最新版を指し、指し先の張り替えと
  redirect を admin が操作する。**版なし slug は恒久的に 200 を返し続ける必要がある** — 外部の
  submission metadata に焼き込まれた参照があり、書き換えられない

## 意図的に持たないもの

| 持たないもの | 理由 |
|---|---|
| 別の検索エンジンへの投影 | 全文検索も facet も同じ Postgres で完結する。投影が無ければ反映待ちも無い |
| dataset の履歴 / experiment の版 | 記述の訂正は履歴ではない。版を持たせると pin する対象が 1 段増える |
| experiment の行 | content の中の要素で足りる。集計は検索用の行が引き受ける |
| `versionIds` / `latestVersion` のような二重管理 | 台帳から導出できる |
| 生 HTML (rawHtml) | 公開画面が読んでいない。値と装飾の分離にもなっていない |
| アーカイブ由来の生メタデータ (originalMetadata) | 必要になった時点で外部キャッシュとして置き直せる |
| 抽出した派生値の層 (searchable) | catalog のキーとして値スロットに吸収する |
| ファイルの帰属と orphan 検出 | 参照が追いきれない。箱の list と選択の差は orphan レポートではない |
| dataset とファイルの名前規約 | 対応は箱の list に対する選択で持つ |
| 申請の中身 (氏名・連絡先・住所) | 個人情報を抱えない。admin 画面が要るときは上流を直読みし、キャッシュしない |
