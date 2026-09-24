# 認証と認可

誰がサインインでき、何を許され、その状態がどこにあるか。**公開ページは認証を要求せず、サインインしても
見えるものは変わらない。** 共有リンクの閲覧者もアカウントを持たない ([editing.md](editing.md))。

## 誰が何をできるか

認証は Keycloak (DDBJ 所管)。**1 人 1 アカウントで、共有アカウントを持ち込まない** — 証跡の解像度が
そこで失われる。

- **人と結び付ける key は Keycloak の `sub`。** 名前は表示と証跡にだけ使う。変わりうる値を key にすると、
  改名で権限と証跡の主体が切れる
- **画面と証跡に出す名前は本名 (`name`)。** 無ければ `preferred_username`、それも無ければ `sub`。名前は
  サインインの時点で session に写すので、名前を変えた人は次のサインインから新しい名前になり、書いた
  記録は書いた時の名前のまま残る
- **admin かどうかはポータルが Postgres に持つ。** Keycloak の role には寄せない — realm が他組織の所管で、
  付与が依頼になり交代に即応できない
- **認可は要求ごとに server で導出し、cookie に焼かない。** admin を外せば次の要求から効く
- **役割は admin ひとつで、認可のコードは capability で書く。** admin は全 capability を持ち、ログイン
  済みで admin でない主体は 1 つも持たない。capability の一覧は `app/auth/capabilities.ts`
- **要求する capability は操作の名前で書く。** 読むだけの画面は `view-unpublished`、書く画面は
  `edit-content` のように。今は答えが変わらなくても、役割を足すときに call site を読み直さずに済む

**capability の検査は、対象が存在するかを調べるより先に行う。** 先に調べると、サインインしていない人に
何が存在するかを答えることになる。**認可の答えは 3 つ。** 未ログインはサインインへ送って元の場所に戻す。ログイン済みで capability が無ければ
403 (サインインし直しても変わらないので redirect にしない)。あれば主体を返す。

## セッション

**cookie に入れるのは推測できない値 1 つで、中身は Postgres の行が持つ。** cookie の中身が認可の根拠に
なる余地を形の側から消す。

- **行は cookie の値の hash を持つ。** 行を読めることと、その人になりすませることを別にする
- **ログアウトは行を消すこと**で、server 側で即座に効く。ログアウトは POST で受ける (他人が置いたリンクや
  画像でセッションを終わらせない)。Keycloak 側のセッションも終わらせる
- **期限は 2 本** — 最終アクセスから 7 日と、発行から 30 日。最終アクセスの更新は 1 時間より古いときだけで、
  ページを読むことが書き込みにならない
- **Keycloak の token は保存しない。** 送る先が無い。例外は Keycloak のセッションを終わらせる
  `id_token_hint` のための id_token だけ
- **client は public client + PKCE (S256)** で、長期の credential を持たない
- **戻り先はサイト内のパスに限り、検査は組み立てた結果の側で行う。** `/..//example.com` はパスとして
  parse できても `Location` に入ると別のホストになる
- **cookie の `Secure` は redirect URI の scheme から決まる。** 別の設定を持たないので、本番で付け忘れる
  余地が無い
- **session の行は失ってよい。** 全員が再ログインするだけで、backup も移行の対象でもない

**書き込みは同じ origin から来たものだけを受ける。** GET / HEAD / OPTIONS 以外の要求は、
`Sec-Fetch-Site` が `same-origin` か `none` で、`Origin` を送るならそれがこのホストを名指すときだけ通し、
それ以外 (別のホスト・`null`・どちらの header も無い) は理由を言わずに 403。検査は root の middleware
(`app/auth/csrf.ts`) が全 route に 1 か所でかける — React Router 自身の検査は画面を持つ route にしか
効かず、`SameSite=Lax` の cookie は同じ登録ドメインの別のサブドメインからの POST にも載るため。

## admin の付け外し

**CLI (`npm run admin:grant` / `admin:revoke`) で行い、管理画面に付け外しの画面を持たない。** 稀な操作で、
打つのは DB の資格情報を持つ人なので、HTTP の認可を新たに持つ理由が無い。CLI 由来の event の actor は
予約された値を焼く。**自分の `sub` は `/admin` を開けば出る** — この入口はセッションだけを要求し、見せる
のは本人の identity だけ。

## 意図的にやっていないこと

| やらないこと | 理由 |
|---|---|
| admin 以外の役割 | 要る実績が無い。capability で書いてあるので、足すときも形は変わらない |
| admin を管理画面から付け外しすること | 稀で、CLI で足りる |
| Keycloak の role で権限を表すこと | realm が他組織の所管 |
| session に access / refresh token を持つこと | 送る先が無い |
| 提供者を認可の主体にすること | 認可を capability に閉じ、上流 DB からの ownership 導出を持たない |
