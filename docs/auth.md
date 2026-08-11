# 認証と認可

誰がサインインでき、何を許され、その状態がどこにあるか。何ができるかを使う側の話は
[editing.md](editing.md) と [publishing.md](publishing.md) にある。

## 誰が何をできるか

認証は Keycloak (DDBJ 所管)。**1 人 1 アカウントとし、共有アカウントは持ち込まない** — 共有
アカウントを許すと証跡の解像度がそこで失われる。

- **人と結び付ける key は Keycloak の `sub`。** `preferred_username` は表示にだけ使う。変わりうる値を
  key にすると、改名で権限と証跡の主体が切れる
- **admin かどうかは v2 側が持つ。** Keycloak の role には寄せない。realm が他組織の所管なので、role の
  付与が依頼になり担当者の交代に即応できない。Postgres に状態だけを持ち、CLI から付け外しする
- **認可は要求ごとに server 側で導出し、cookie に焼かない。** admin を外せば次の要求から効く
- **役割は admin ひとつ。** 認可のコードは capability で書き、admin は全 capability を持つ唯一の役割

| capability | 何を許すか |
|---|---|
| `view-unpublished` | 管理画面で未公開を読む |
| `edit-content` | draft の作成・編集・破棄、共有リンクの管理、コメントの解決 |
| `publish` | 版の公開と fix |
| `withdraw` | 取り下げと再公開 |
| `manage-labels` | hum ラベルと dataset id の pin と解除 |
| `manage-files` | ファイルの upload と公開状態の切り替え |
| `manage-catalog` | catalog のキーと語彙 |
| `manage-admins` | admin の付け外し |
| `delete-research` | research の削除 |

**ログイン済みで admin でない主体は capability を 1 つも持たない。** 導出を「主体 → capability の集合」の
形にしてあるので、後から一般利用者向けの操作を足すときに認可の形を触らずに済む。

**要求する capability は操作の名前で書く。** admin が全部を持つので実際の答えは変わらないが、読み取り
だけの画面は `view-unpublished` を、書き込みと編集画面は `edit-content` を通る。後から役割を足すときに
call site を読み直さずに済む。

**認可が返す答えは 3 つだけ。** 未ログインはサインインへ送って元の場所に戻す。ログイン済みで capability が
無ければ 403 — サインインし直しても答えは変わらないので、redirect にしない。あれば主体を返す。

## セッション

**cookie に入れるのは推測不能な値 1 つで、セッションの中身は Postgres の行が持つ。** cookie の中身が
認可の根拠になる余地を構造的に消すためで、「認可を cookie に焼かない」を cookie の形の側からも守る。

- **行は cookie の値の hash を持つ。** 行を読めることと、その人になりすませられることを別にする
- **ログアウトは行を消すこと**なので server 側で即座に効く。cookie を消すだけにしない
- **期限は 2 本** — 最終アクセスから 7 日と、発行から 30 日。cookie の寿命を後者にして前者は読み取りの
  ときに判定する。最終アクセス時刻の更新は値が 1 時間より古いときだけで、**ページを読むことが書き込みに
  ならない**。期限切れの行の掃除はログインのときに行う
- **Keycloak の token は保存しない。** public API に認証が無く、token を付けて転送する先も無い。例外は
  id_token だけで、Keycloak 側のセッションを終わらせる `id_token_hint` に要る
- **client は public client + PKCE (S256)。** 長期の credential を 1 つも持たないので、client secret が
  守る対象が無い。`state` と PKCE の verifier と戻り先は 10 分の cookie に置く
- **戻り先はサイト内のパスに限る。検査は結果の側で行う** — `/..//example.com` は「このサイトのパス」として
  parse できてしまい、`Location` に入った瞬間に別のホストになる
- **session の行は失ってよい。** 失えば全員が再ログインするだけなので、backup も移行の対象にならない

**セッションは編集の画面でも identity として使われる。** 同じ draft を開いている人の一覧は (draft,
セッション) を主キーに持つので ([editing.md](editing.md) の「同時編集」)、ログアウトはそこからも消える。

## admin の付け外し

**CLI 1 本で行い、管理画面には付け外しの画面を持たない。** 付け外しは `sub` を指定して行う稀な操作で、
実行するのは DB の資格情報を持つ人なので、HTTP 経由の認可を新たに持つ理由が無い。dev の初期 admin も、
本番の初期 admin (移行の作業項目) も、以降の付け外しもこれで入れる。CLI 由来の event の actor は人では
ないので、予約された値を焼く。

**`sub` を見せるのは管理画面の入口。** ここはセッションだけを要求し、開いた人自身の `sub` を見せる。
見せるのは本人の identity だけで、ポータルのデータは capability の要る画面の側にある。

**`manage-admins` を要求する `requireCapability` の呼び出しは無い。** 付け外しが CLI に閉じているので
HTTP の認可を通らない。それでも capability として名前を持つのは、event の action に対応する操作をすべて
capability の形で名指すため。

## 意図的にやっていないこと

| やらないこと | 理由 |
|---|---|
| admin 以外の役割 | 実績が無い。Joomla は 6 段の編集役割を持ちながら 3 つが在籍 0 人だった |
| admin を管理画面から付け外しすること | 稀な操作で、`sub` を得るには結局管理画面を開いてもらうことになる。CLI で足りる |
| Keycloak の role で権限を表すこと | realm が他組織の所管で、付与が依頼になり交代に即応できない |
| session に access / refresh token を持つこと | 送る先が無い。public API に認証が無く、resource server も無い |
| 提供者を認可主体にすること | 認可を capability ベースにし、上流 DB からの ownership 導出を無くす |
