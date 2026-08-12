/**
 * The parts catalogue.
 *
 * One page showing every part the screens are built from, drawn against rows
 * taken out of the database (`dev-ui.data.ts`) rather than against invented
 * ones — a table looks fine until a real accession list is in it, and a badge
 * looks fine until it sits beside a real title. It is also what a change to a
 * part is checked against: open it before and after, and the difference is the
 * whole of what moved.
 *
 * **Hover and focus are not drawn here.** A state the page cannot be in while
 * standing still cannot be shown by standing still; those two are checked by
 * driving the page. What is here is every state a part can be in on arrival —
 * chosen, disabled, refused, empty, and holding more text than it has room for.
 *
 * **It is not part of the site** and is left out of the production build
 * (`app/routes.ts`).
 */

import { useState } from "react"
import { Link } from "react-router"

import { AddToCartButton, CartToggle } from "~/components/cart"
import { Markdown } from "~/components/markdown"
import {
  ConditionChips,
  NoResults,
  SearchExamples,
  SearchForm,
  SortLinks,
} from "~/components/search"
import { ActionButton, ActionRow, NewsList } from "~/components/site"

import {
  Announcement,
  Badge,
  Band,
  BAND_FILL,
  BigAction,
  Breadcrumb,
  Button,
  ButtonLink,
  type ButtonVariant,
  Chip,
  Clamped,
  Confirm,
  Heading,
  IconButton,
  LanguagePills,
  Menu,
  Note,
  RoundLink,
  type NoteKind,
  Progress,
  SectionTabs,
  Stack,
  SwitchTabs,
  TabPanel,
  type Tone,
} from "~/components/base"
import { FacetPanel } from "~/components/facets"
import {
  BilingualField,
  Checkbox,
  Field,
  FileField,
  RadioGroup,
  Result,
  Select,
  Submit,
  TextArea,
} from "~/components/form"
import { Icon, ICON_NAMES } from "~/components/icons"
import {
  AccessTypeBadge,
  Card,
  Empty,
  KeyValue,
  Page,
  PageHead,
  PageLinks,
  Section,
  Table,
  Td,
  Value,
} from "~/components/page"
import { DEFAULT_LOCALE } from "~/i18n/locale"

import { FACETS, NEWS, REFINED_FACETS, ROWS, TOTAL } from "./dev-ui.data"

export function meta() {
  return [{ title: "部品 - NBDC Human Database" }]
}

const LOCALE = DEFAULT_LOCALE

/**
 * Everything the site-content renderer can emit, as one article. The markdown
 * dialect is CommonMark plus GFM tables and nothing else, so this is the whole
 * of what `app.css` has to style (`app/public/markdown.server.ts`).
 */
const PROSE = [
  "<h2>見出し (h2)</h2>",
  "<p>段落。<a href=\"/guidelines\">リンク</a>と<strong>強調</strong>と<code>コード</code>を含む。</p>",
  "<h3>見出し (h3)</h3>",
  "<ul><li>箇条書き</li><li>2 つ目</li></ul>",
  "<ol><li>順序つき</li><li>2 つ目</li></ol>",
  "<blockquote><p>引用。ガイドラインの条文を引くときに出る。</p></blockquote>",
  "<table><thead><tr><th>データセット ID</th><th>アクセス制限</th></tr></thead>",
  "<tbody><tr><td>JGAD000117</td><td>制限公開（Type I）</td></tr>",
  "<tr><td>JGAD000403</td><td>制限公開（Type I）</td></tr></tbody></table>",
  "<pre><code>hum0197.v3.gwas.v1</code></pre>",
  "<hr />",
  "<p>水平線の下。</p>",
].join("")

const SECTIONS = [
  ["colour", "色"],
  ["type", "文字"],
  ["rhythm", "間隔"],
  ["icon", "アイコン"],
  ["band", "帯と見出し"],
  ["button", "ボタン"],
  ["big-action", "大きな導線"],
  ["badge", "バッジと印"],
  ["note", "注記"],
  ["announcement", "告知"],
  ["header-controls", "ヘッダの操作"],
  ["trail", "パンくず"],
  ["tabs", "タブ"],
  ["table", "表"],
  ["panel", "絞り込みパネル"],
  ["search", "検索まわり"],
  ["cart", "カート"],
  ["entry", "入り口"],
  ["prose", "記事の本文"],
  ["input", "入力"],
  ["ask", "確認・メニュー・進行"],
  ["nothing", "何も無いとき"],
] as const

const COLOURS: [string, string, string][] = [
  ["brand", "bg-brand", "リンク・見出し・帯の左端"],
  ["brand-light", "bg-brand-light", "帯の右端"],
  ["accent", "bg-accent", "強調"],
  ["accent-light", "bg-accent-light", "強調の帯の右端"],
  ["deep", "bg-deep", "主題の帯の左端"],
  ["ink", "bg-ink", "本文"],
  ["ink-muted", "bg-ink-muted", "添え字・主題の帯の右端"],
  ["line", "bg-line", "罫線"],
  ["line-strong", "bg-line-strong", "入力欄と操作の枠"],
  ["surface", "bg-surface", "頁の地"],
  ["surface-hover", "bg-surface-hover", "指した行"],
  ["surface-input", "bg-surface-input", "入力欄の地"],
  ["warning", "bg-warning", "見てほしいこと"],
  ["warning-surface", "bg-warning-surface", "告知の地"],
  ["danger", "bg-danger", "戻せないこと"],
  ["visited", "bg-visited", "読んだリンク"],
]

const TEXT_SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl"]

const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "accent", "secondary", "danger", "ghost"]
const TONES: Tone[] = ["brand", "accent", "muted", "warning", "danger"]
const NOTE_KINDS: NoteKind[] = ["info", "tip", "warning", "danger"]

const FIELD_TABS = [
  { id: "title", label: "研究題目" },
  { id: "summary", label: "研究概要", mark: <Badge tone="warning">未保存</Badge> },
  { id: "providers", label: "提供者情報", mark: <Badge tone="brand">2</Badge> },
  { id: "grant", label: "助成金情報" },
]

export default function DevUi() {
  const [tab, setTab] = useState("title")
  const [listTab, setListTab] = useState<"research" | "dataset">("research")
  const first = ROWS[0]

  return (
    <Page>
      <PageHead kicker="本番では出ない 1 枚" label="部品">
        <Badge onBand>{`実データ ${String(ROWS.length)} 行を凍結`}</Badge>
      </PageHead>
      <Card>
        <Stack gap="block">
          <nav aria-label="この頁の節" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>

          <Section title="色">
            <div id="colour" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {COLOURS.map(([name, fill, use]) => (
                <div key={name}>
                  <div className={`h-10 rounded border border-line ${fill}`} />
                  <div className="mt-1 font-mono text-ink text-xs">{name}</div>
                  <div className="text-ink-muted text-xs">{use}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-ink-muted text-sm">
              白文字を載せてよいのは brand / brand-light / accent / deep / ink-muted / danger の 6 つだけ。
              比は app/app.contrast.test.ts が見張っている。
            </p>
          </Section>

          <Section title="文字">
            <div id="type" className="flex flex-col gap-1">
              {TEXT_SIZES.map((size) => (
                <p key={size} className={size}>
                  <span className="text-ink-muted text-xs">{size}</span>
                  {"　"}
                  シークエンス解析によるがんゲノム研究 — Genome sequencing analysis
                </p>
              ))}
            </div>
          </Section>

          <Section title="間隔">
            <Stack gap="block">
              <p id="rhythm" className="text-ink-muted text-sm">
                縦の間隔は 3 つだけで、画面は margin を書かない。持っているのは Stack。
                tight はラベルと値、normal は箱の中の要素どうし、block は節と節。
              </p>
              {(["tight", "normal", "block"] as const).map((gap) => (
                <Stack key={gap} gap="tight">
                  <p className="font-mono text-ink-muted text-xs">{`gap="${gap}"`}</p>
                  <Stack gap={gap}>
                    <div className="h-6 rounded bg-surface" />
                    <div className="h-6 rounded bg-surface" />
                  </Stack>
                </Stack>
              ))}
              <p className="text-ink-muted text-sm">
                押せるものでアイコンだけのものは 36px 四方 (@theme の tap)。
                表の行の高さと同じなので、一覧の中の印も同じ大きさで置ける。
              </p>
            </Stack>
          </Section>

          <Section title="アイコン">
            <div id="icon" className="grid grid-cols-4 gap-3 text-sm sm:grid-cols-6 lg:grid-cols-8">
              {ICON_NAMES.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <Icon name={name} className="text-lg text-brand" />
                  <span className="text-ink-muted text-xs">{name}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="帯と見出し">
            <div id="band" className="flex flex-col gap-8">
              <div>
                <p className="mb-2 text-ink-muted text-sm">
                  帯は「名前を持つ 1 つのものについての頁」だけ。deep が主題、brand がその下の節と表。
                </p>
                <Band tone="deep" className="rounded-t">
                  <div>
                    <p className="text-white/80 text-xs">NBDC Research ID:</p>
                    <span className="flex items-center gap-3 font-bold text-xl">
                      <Icon name="book" />
                      hum0103-v4
                      <Badge onBand>最新</Badge>
                    </span>
                  </div>
                  <span className="text-sm">リリース情報</span>
                </Band>
                <div className="rounded-b bg-white px-5 py-4 text-sm">
                  帯の下は白い箱。頁の地が薄いグレーなので、箱が箱として読める。
                </div>
              </div>
              <Band>
                <span className="font-bold">brand — 節と表の見出し</span>
                <span className="text-sm">添える語</span>
              </Band>
              <Band tone="accent">
                <span className="font-bold">accent — 頁が 1 つだけ持てる呼びかけ</span>
              </Band>
              <div>
                <p className="mb-2 text-ink-muted text-sm">一覧と記事はこちら。帯を使わない。</p>
                <Heading title="研究一覧" count={`全 ${String(TOTAL)} 件`}>
                  <Button type="button" pill icon={<Icon name="copy" />}>コピー</Button>
                  <Button type="button" pill icon={<Icon name="download" />}>CSV</Button>
                  <Button type="button" pill icon={<Icon name="filter" />}>絞り込み</Button>
                </Heading>
              </div>
            </div>
          </Section>

          <Section title="ボタン">
            <div id="button" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {BUTTON_VARIANTS.map((variant) => (
                  <Button key={variant} type="button" variant={variant}>{variant}</Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {BUTTON_VARIANTS.map((variant) => (
                  <Button key={variant} type="button" variant={variant} pill icon={<Icon name="save" />}>
                    {`${variant} · pill`}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="primary" size="md">md</Button>
                <Button type="button" variant="accent" size="lg">lg — 頁の呼びかけ</Button>
                <Button type="button" variant="primary" disabled>変更がありません</Button>
                <Button type="button" variant="danger" disabled icon={<Icon name="trash" />}>削除する</Button>
                <ButtonLink to="/research" variant="secondary" icon={<Icon name="external" />}>
                  研究一覧へ
                </ButtonLink>
                <IconButton name="edit" label="編集する" />
                <IconButton name="trash" label="削除する" />
                <IconButton name="grip" label="並べ替える" />
              </div>
            </div>
          </Section>

          <Section title="大きな導線">
            <div id="big-action" className="grid gap-4 sm:grid-cols-2">
              <BigAction to="/data-submission" tone="accent" icon="upload">データの提供</BigAction>
              <BigAction to="/data-use" tone="brand" icon="download">データの利用</BigAction>
            </div>
          </Section>

          <Section title="バッジと印">
            <div id="badge" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {TONES.map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand" icon={<Icon name="book" />}>研究</Badge>
                <Badge tone="brand" icon={<Icon name="database" />}>データセット</Badge>
                <Badge tone="muted" icon={<Icon name="eye" />}>未公開</Badge>
                <Badge tone="warning" icon={<Icon name="warning" />}>上流と食い違い</Badge>
                <Badge tone="danger" icon={<Icon name="alert" />}>公開できません</Badge>
              </div>
              <Band className="rounded">
                <span className="flex items-center gap-2 text-sm">
                  帯の上では
                  <Badge onBand>白い輪郭</Badge>
                  <Badge onBand>下書き 1</Badge>
                </span>
              </Band>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-ink-muted">アクセス制限は輪郭を持たない —</span>
                {(first?.accessTypes ?? []).map((term) => (
                  <AccessTypeBadge key={term.code} term={term} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip label="制限公開（Type I）" to="/research" remove="この条件を外す" />
                <Chip label="肺癌" to="/research" remove="この条件を外す" />
              </div>
            </div>
          </Section>

          <Section title="注記">
            <div id="note" className="flex flex-col gap-3">
              {NOTE_KINDS.map((kind) => (
                <Note key={kind} kind={kind}>
                  {kind}
                  {" — "}
                  データ利用終了報告未提出のガイドライン違反者は
                  <a href="/guidelines">こちら</a>
                  に公表されることになります。
                </Note>
              ))}
            </div>
          </Section>

          <Section title="告知">
            <div id="announcement" className="flex flex-col gap-2">
              <Announcement dismiss="このお知らせを閉じる" onDismiss={() => undefined}>
                現在、多数のデータ提供申請をいただいており、確認作業に通常よりも時間を要しております。
                お待たせして大変申し訳ございませんが、何卒ご理解いただけますようお願い申し上げます。
              </Announcement>
              <Announcement dismiss="このお知らせを閉じる">
                閉じる操作を持たない形。ページが読み込まれた直後の姿で、script が動くと × が付く。
              </Announcement>
            </div>
          </Section>

          <Section title="ヘッダの操作">
            <div id="header-controls" className="flex flex-wrap items-center gap-3">
              <LanguagePills
                label="言語"
                options={[
                  { code: "en", label: "EN", to: "/en", current: false },
                  { code: "ja", label: "JA", to: "/", current: true },
                ]}
              />
              <RoundLink to="/research" name="search" label="キーワード検索" />
              <RoundLink to="/cart" name="cart" label="カート" />
              <RoundLink to="/cart" name="cart" label="カート（3 件）" count={3} />
              <RoundLink to="/auth/login" name="log-in" label="ログイン" filled external />
              <Menu label="アカウント" icon="menu" round>
                <Link to="/admin" className="px-4 py-2 text-sm no-underline hover:bg-surface-hover">
                  管理
                </Link>
              </Menu>
            </div>
          </Section>

          <Section title="パンくず">
            <div id="trail">
              <Breadcrumb
                label="現在地"
                trail={[{ label: "ホーム", to: "/" }, { label: "研究一覧", to: "/research" }]}
                current="hum0103"
              />
            </div>
          </Section>

          <Section title="タブ">
            <div id="tabs" className="flex flex-col gap-8">
              <div>
                <p className="mb-2 text-ink-muted text-sm">
                  一覧の切り替え (公開側)。リンクなので共有できる。箱の右上に付く。
                </p>
                <SwitchTabs
                  label="研究 / データセット"
                  tabs={[
                    { label: "研究", to: "?listTab=research", current: listTab === "research" },
                    { label: "データセット", to: "?listTab=dataset", current: listTab === "dataset" },
                  ]}
                />
                <div className="border-line border-t bg-white px-5 py-4 text-sm">
                  <button
                    type="button"
                    onClick={() => { setListTab(listTab === "research" ? "dataset" : "research") }}
                    className="cursor-pointer underline"
                  >
                    この頁では見本なので、押すと選択だけ入れ替わる
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-ink-muted text-sm">
                  長い編集フォームを切る (admin)。切り替わるのは表示だけで、全 field は文書に残る。
                  矢印キーと Home / End で動く。
                </p>
                <SectionTabs label="編集する節" tabs={FIELD_TABS} current={tab} onSelect={setTab} />
                {FIELD_TABS.map((entry) => (
                  <TabPanel key={entry.id} id={entry.id} current={tab}>
                    <div className="py-4">
                      <BilingualField label={entry.label} name={entry.id} />
                    </div>
                  </TabPanel>
                ))}
              </div>
            </div>
          </Section>

          <Section title="表">
            <div id="table">
              <Table
                headers={[
                  <span key="cart" className="sr-only">カート</span>,
                  "研究 ID",
                  "研究題目",
                  "データセット",
                  "アクセス制限",
                  "公開日",
                ]}
              >
                {ROWS.map((row) => (
                  <tr key={row.humLabel} className="bg-white hover:bg-surface-hover">
                    <Td nowrap>
                      <IconButton name="cart" label={`${row.humLabel} をカートに入れる`} />
                    </Td>
                    <Td nowrap>
                      <Link to={`/research/${row.humLabel}`} className="flex items-center gap-1">
                        <Icon name="book" />
                        {row.humLabel}
                      </Link>
                    </Td>
                    <Td><Value field={row.title} locale={LOCALE} /></Td>
                    <Td nowrap>
                      <Clamped
                        items={row.datasetLabels.map((label) => (
                          <span key={label} className="flex items-center gap-1">
                            <Icon name="database" className="text-ink-muted" />
                            {label}
                          </span>
                        ))}
                        more={(rest) => `他 ${String(rest)} 件`}
                      >
                        <Link to={`/research/${row.humLabel}`}>
                          {`他 ${String(row.datasetLabels.length - 3)} 件を見る`}
                        </Link>
                      </Clamped>
                    </Td>
                    <Td nowrap>
                      <div className="flex flex-col items-start gap-1">
                        {row.accessTypes.map((term) => (
                          <AccessTypeBadge key={term.code} term={term} />
                        ))}
                      </div>
                    </Td>
                    <Td nowrap>{row.datePublished ?? ""}</Td>
                  </tr>
                ))}
              </Table>
              <PageLinks
                label="ページ送り"
                page={3}
                pageCount={20}
                at={(page) => `?page=${String(page)}`}
                previous="前へ"
                next="次へ"
              />
            </div>
          </Section>

          <Section title="絞り込みパネル">
            <div id="panel" className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-ink-muted text-sm">何も選んでいないとき。</p>
                <FacetPanel locale={LOCALE} target="research" query="" sort={null} panel={FACETS} />
              </div>
              <div>
                <p className="mb-2 text-ink-muted text-sm">
                  1 つ選んで 1 つ開いたとき。条件が入っている区画は必ず開く。
                </p>
                <FacetPanel
                  locale={LOCALE}
                  target="research"
                  query="access-criteria:controlled-access-type-1"
                  sort={null}
                  panel={REFINED_FACETS}
                />
              </div>
            </div>
          </Section>

          <Section title="検索まわり">
            <div id="search" className="flex flex-col gap-6">
              <div>
                <p className="mb-2 text-ink-muted text-sm">トップの窓 (large) と一覧の窓。</p>
                <div className="flex flex-col gap-4">
                  <SearchForm locale="ja" target="research" keyword="" query="" size="large" />
                  <SearchForm locale="ja" target="research" keyword="肺がん" query="" />
                </div>
                <SearchExamples locale="ja" />
              </div>
              <div>
                <p className="mb-2 text-ink-muted text-sm">
                  窓に出せない条件。チップ全体が「その条件を外す」リンク。
                </p>
                <ConditionChips
                  locale="ja"
                  conditions={[
                    { label: "アクセス制限: 制限公開（Type I）", href: "/research" },
                    { label: "除外: メチル化", href: "/research" },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-ink-muted text-sm">並び替え。選ばれているものは押せない。</p>
                <SortLinks
                  locale="ja"
                  target="research"
                  query=""
                  sort="dateModified"
                  options={["relevance", "dateModified", "datePublished", "id"]}
                />
              </div>
              <div>
                <p className="mb-2 text-ink-muted text-sm">0 件のとき。緩めた検索は投げない。</p>
                <NoResults locale="ja" />
              </div>
            </div>
          </Section>

          <Section title="カート">
            <div id="cart" className="flex flex-col gap-4">
              <p className="text-ink-muted text-sm">
                押すと本当に入る (このページの sessionStorage を触る)。JGAD 以外は印が出ない。
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <span className="flex items-center gap-2 text-sm">
                  行:
                  <CartToggle ids={["JGAD000117"]} locale="ja" />
                </span>
                <span className="flex items-center gap-2 text-sm">
                  研究の行 (配下をまとめて):
                  <CartToggle ids={["JGAD000117", "JGAD000403", "DRA014188"]} locale="ja" />
                </span>
                <span className="flex items-center gap-2 text-sm">
                  入れられないものだけの行:
                  <CartToggle ids={["DRA014188"]} locale="ja" />
                  <span className="text-ink-muted text-xs">(何も出ない)</span>
                </span>
              </div>
              <div className={`flex flex-wrap items-center gap-4 rounded p-3 ${BAND_FILL.deep}`}>
                <span className="text-sm text-white">帯の上:</span>
                <CartToggle ids={["JGAD000117", "JGAD000403"]} locale="ja" whole />
                <AddToCartButton datasetLabel="JGAD000117" locale="ja" />
              </div>
            </div>
          </Section>

          <Section title="入り口">
            <div id="entry" className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <BigAction to="/data-submission" tone="accent" icon="upload">データの提供</BigAction>
                <BigAction to="/data-use" tone="brand" icon="download">データの利用</BigAction>
              </div>
              <ActionRow>
                <ActionButton
                  href="https://example.org/"
                  label="登録ナビゲーション"
                  note="初めての方"
                  tone="accent"
                  icon="upload"
                />
                <ActionButton
                  href="https://example.org/"
                  label="データ提供申請を行う"
                  note="2 回目以降の方"
                  tone="accent"
                  icon="edit"
                />
              </ActionRow>
              <p>ボタンの下に付く一文。リンクを含む。</p>
              <div className="max-w-96">
                <p className="mb-2 text-ink-muted text-sm">
                  お知らせの並び。トップの右カラムと一覧が同じもの。
                </p>
                <NewsList locale="ja" items={NEWS} />
              </div>
            </div>
          </Section>

          <Section title="記事の本文">
            <div id="prose">
              <p className="mb-2 text-ink-muted text-sm">
                サイトコンテンツの markdown が出せる要素の全部。意匠は app.css が持つ。
              </p>
              <Markdown html={PROSE} />
            </div>
          </Section>

          <Section title="入力">
            <div id="input" className="flex flex-col gap-6">
              <Result ok>保存しました。</Result>
              <Result ok={false}>ほかの人が先に保存しています。読み込み直してください。</Result>
              <div className="flex flex-wrap items-start gap-6">
                <Field label="コード" name="code" value="platform" hint="小文字とハイフン" />
                <Field label="表示名 (ja)" name="ja" value="プラットフォーム" />
                <Field label="研究 ID" name="hum" value="hum000" error="そのラベルは使われています" />
                <Field label="発行済み" name="issued" value="hum0103" disabled />
                <Select
                  label="型"
                  name="kind"
                  value="vocabulary"
                  options={[
                    { value: "text", label: "自由文" },
                    { value: "vocabulary", label: "語彙" },
                    { value: "number", label: "数値" },
                  ]}
                />
              </div>
              <BilingualField
                label="研究題目"
                name="title"
                ja="シークエンス解析によるがんゲノム研究：胆道がん"
                en="Genome sequencing analysis for biliary tract cancer"
              />
              <div className="flex flex-wrap items-start gap-8">
                <RadioGroup
                  label="公開の仕方"
                  name="how"
                  value="new"
                  options={[
                    { value: "new", label: "新しい版として" },
                    { value: "fix", label: "この版を直す" },
                  ]}
                />
                <div className="flex flex-col gap-2">
                  <Checkbox label="このファイルを選ぶ" name="pick" checked />
                  <Checkbox label="公開しない" name="hide" />
                  <Checkbox label="上流から取れない" name="upstream" disabled />
                </div>
                <FileField label="ファイル" name="file" hint="64 MiB を超えると分割して送る" multiple />
              </div>
              <TextArea label="本文 (markdown)" name="body" rows={4} value={"## 見出し\n\n本文。"} />
              <div className="flex flex-wrap items-center gap-3">
                <Submit variant="primary">保存</Submit>
                <Submit>取り消す</Submit>
                <Submit variant="primary" disabled>変更がありません</Submit>
              </div>
            </div>
          </Section>

          <Section title="確認・メニュー・進行">
            <div id="ask" className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-6">
                <Confirm
                  label="この研究を削除する"
                  warning="公開版も下書きも消えます"
                  confirm="削除する"
                  cancel="やめる"
                />
                <Menu label="ほかの操作">
                  <Link to="/dev/ui" className="px-4 py-2 text-sm no-underline hover:bg-surface-hover">
                    複製する
                  </Link>
                  <Link to="/dev/ui" className="px-4 py-2 text-sm no-underline hover:bg-surface-hover">
                    下書きにする
                  </Link>
                </Menu>
              </div>
              <div className="max-w-sm">
                <Progress label="hum0103.v1.CpG.v1.zip を送っています" done={62} total={100} />
              </div>
            </div>
          </Section>

          <Section title="何も無いとき">
            <div id="nothing" className="flex flex-col gap-6">
              <div>
                <p className="mb-2 text-ink-muted text-sm">一覧に 1 件も無いとき。</p>
                <Table headers={["研究 ID", "研究題目"]}>
                  <tr>
                    <Td className="text-center text-ink-muted">見つかりませんでした</Td>
                    <Td />
                  </tr>
                </Table>
              </div>
              <Empty>データがありません</Empty>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <KeyValue title="代表者">中川 英刀</KeyValue>
                <KeyValue title="所属機関">理化学研究所 生命医科学研究センター</KeyValue>
                <KeyValue title="ORCID"><Empty>—</Empty></KeyValue>
              </dl>
            </div>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
