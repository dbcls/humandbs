/**
 * The country of a controlled-access user, in both languages.
 *
 * Upstream holds the country as English free text typed by the applicant
 * (`USA`, `Korea`, `HKG`, `Viet Nam`), and the state as a free-text address
 * line beside it (`MA`, `Massachusetts`, `Choose One...`). Neither language of
 * the name exists upstream, so the portal has its own table and folds the
 * spellings onto it.
 *
 * **The state is kept only for the federations listed in `REGIONS`**, where a
 * state or province makes its own law on the use of personal data, so the
 * state matters to the terms a user works under. Elsewhere the
 * address line is dropped whatever it holds.
 *
 * Anything the tables do not recognise is shown as upstream wrote it, in both
 * languages: a country left in English is better than one left out. A state
 * that is not recognised is dropped rather than shown, because the line is
 * filled with placeholders as often as with states.
 */

import type { Bilingual } from "~/content/types"

interface Name {
  ja: string
  en: string
}

type Table = Record<string, Name & { aliases: string[] }>

const COUNTRIES: Table = {
  JP: { ja: "日本", en: "Japan", aliases: ["jpn"] },
  US: { ja: "アメリカ合衆国", en: "United States", aliases: ["usa", "unitedstatesofamerica", "america"] },
  CA: { ja: "カナダ", en: "Canada", aliases: ["can"] },
  AU: { ja: "オーストラリア", en: "Australia", aliases: ["aus"] },
  CN: { ja: "中国", en: "China", aliases: ["chn", "prc", "peoplesrepublicofchina"] },
  HK: { ja: "香港", en: "Hong Kong", aliases: ["hkg", "hongkongsar"] },
  TW: { ja: "台湾", en: "Taiwan", aliases: ["twn"] },
  KR: { ja: "韓国", en: "South Korea", aliases: ["kor", "korea", "republicofkorea", "korearepublicof"] },
  SG: { ja: "シンガポール", en: "Singapore", aliases: ["sgp"] },
  MY: { ja: "マレーシア", en: "Malaysia", aliases: [] },
  TH: { ja: "タイ", en: "Thailand", aliases: [] },
  VN: { ja: "ベトナム", en: "Vietnam", aliases: ["vnm"] },
  ID: { ja: "インドネシア", en: "Indonesia", aliases: [] },
  PH: { ja: "フィリピン", en: "Philippines", aliases: [] },
  IN: { ja: "インド", en: "India", aliases: [] },
  IL: { ja: "イスラエル", en: "Israel", aliases: [] },
  QA: { ja: "カタール", en: "Qatar", aliases: [] },
  SA: { ja: "サウジアラビア", en: "Saudi Arabia", aliases: [] },
  TR: { ja: "トルコ", en: "Türkiye", aliases: ["turkey"] },
  GB: { ja: "イギリス", en: "United Kingdom", aliases: ["uk", "gbr", "greatbritain", "england", "scotland", "wales"] },
  IE: { ja: "アイルランド", en: "Ireland", aliases: [] },
  DE: { ja: "ドイツ", en: "Germany", aliases: ["deu"] },
  FR: { ja: "フランス", en: "France", aliases: ["fra"] },
  NL: { ja: "オランダ", en: "Netherlands", aliases: ["thenetherlands"] },
  BE: { ja: "ベルギー", en: "Belgium", aliases: [] },
  CH: { ja: "スイス", en: "Switzerland", aliases: [] },
  AT: { ja: "オーストリア", en: "Austria", aliases: [] },
  IT: { ja: "イタリア", en: "Italy", aliases: [] },
  ES: { ja: "スペイン", en: "Spain", aliases: [] },
  PT: { ja: "ポルトガル", en: "Portugal", aliases: [] },
  GR: { ja: "ギリシャ", en: "Greece", aliases: [] },
  SE: { ja: "スウェーデン", en: "Sweden", aliases: [] },
  NO: { ja: "ノルウェー", en: "Norway", aliases: [] },
  DK: { ja: "デンマーク", en: "Denmark", aliases: [] },
  FI: { ja: "フィンランド", en: "Finland", aliases: [] },
  PL: { ja: "ポーランド", en: "Poland", aliases: [] },
  HU: { ja: "ハンガリー", en: "Hungary", aliases: [] },
  CZ: { ja: "チェコ", en: "Czechia", aliases: ["czechrepublic"] },
  RU: { ja: "ロシア", en: "Russia", aliases: ["russianfederation"] },
  NZ: { ja: "ニュージーランド", en: "New Zealand", aliases: [] },
  MX: { ja: "メキシコ", en: "Mexico", aliases: [] },
  BR: { ja: "ブラジル", en: "Brazil", aliases: [] },
  AR: { ja: "アルゼンチン", en: "Argentina", aliases: [] },
  CL: { ja: "チリ", en: "Chile", aliases: [] },
  EG: { ja: "エジプト", en: "Egypt", aliases: [] },
  KE: { ja: "ケニア", en: "Kenya", aliases: [] },
  NG: { ja: "ナイジェリア", en: "Nigeria", aliases: [] },
  ZA: { ja: "南アフリカ", en: "South Africa", aliases: [] },
}

/** Keyed by the ISO 3166-2 code without its country prefix. */
const REGIONS: Record<string, Table> = {
  US: {
    AL: { ja: "アラバマ州", en: "Alabama", aliases: [] },
    AK: { ja: "アラスカ州", en: "Alaska", aliases: [] },
    AZ: { ja: "アリゾナ州", en: "Arizona", aliases: [] },
    AR: { ja: "アーカンソー州", en: "Arkansas", aliases: [] },
    CA: { ja: "カリフォルニア州", en: "California", aliases: [] },
    CO: { ja: "コロラド州", en: "Colorado", aliases: [] },
    CT: { ja: "コネチカット州", en: "Connecticut", aliases: [] },
    DE: { ja: "デラウェア州", en: "Delaware", aliases: [] },
    DC: { ja: "コロンビア特別区", en: "District of Columbia", aliases: ["washingtondc"] },
    FL: { ja: "フロリダ州", en: "Florida", aliases: [] },
    GA: { ja: "ジョージア州", en: "Georgia", aliases: [] },
    HI: { ja: "ハワイ州", en: "Hawaii", aliases: [] },
    ID: { ja: "アイダホ州", en: "Idaho", aliases: [] },
    IL: { ja: "イリノイ州", en: "Illinois", aliases: [] },
    IN: { ja: "インディアナ州", en: "Indiana", aliases: [] },
    IA: { ja: "アイオワ州", en: "Iowa", aliases: [] },
    KS: { ja: "カンザス州", en: "Kansas", aliases: [] },
    KY: { ja: "ケンタッキー州", en: "Kentucky", aliases: [] },
    LA: { ja: "ルイジアナ州", en: "Louisiana", aliases: [] },
    ME: { ja: "メイン州", en: "Maine", aliases: [] },
    MD: { ja: "メリーランド州", en: "Maryland", aliases: [] },
    MA: { ja: "マサチューセッツ州", en: "Massachusetts", aliases: [] },
    MI: { ja: "ミシガン州", en: "Michigan", aliases: [] },
    MN: { ja: "ミネソタ州", en: "Minnesota", aliases: [] },
    MS: { ja: "ミシシッピ州", en: "Mississippi", aliases: [] },
    MO: { ja: "ミズーリ州", en: "Missouri", aliases: [] },
    MT: { ja: "モンタナ州", en: "Montana", aliases: [] },
    NE: { ja: "ネブラスカ州", en: "Nebraska", aliases: [] },
    NV: { ja: "ネバダ州", en: "Nevada", aliases: [] },
    NH: { ja: "ニューハンプシャー州", en: "New Hampshire", aliases: [] },
    NJ: { ja: "ニュージャージー州", en: "New Jersey", aliases: [] },
    NM: { ja: "ニューメキシコ州", en: "New Mexico", aliases: [] },
    NY: { ja: "ニューヨーク州", en: "New York", aliases: [] },
    NC: { ja: "ノースカロライナ州", en: "North Carolina", aliases: [] },
    ND: { ja: "ノースダコタ州", en: "North Dakota", aliases: [] },
    OH: { ja: "オハイオ州", en: "Ohio", aliases: [] },
    OK: { ja: "オクラホマ州", en: "Oklahoma", aliases: [] },
    OR: { ja: "オレゴン州", en: "Oregon", aliases: [] },
    PA: { ja: "ペンシルベニア州", en: "Pennsylvania", aliases: [] },
    RI: { ja: "ロードアイランド州", en: "Rhode Island", aliases: [] },
    SC: { ja: "サウスカロライナ州", en: "South Carolina", aliases: [] },
    SD: { ja: "サウスダコタ州", en: "South Dakota", aliases: [] },
    TN: { ja: "テネシー州", en: "Tennessee", aliases: [] },
    TX: { ja: "テキサス州", en: "Texas", aliases: [] },
    UT: { ja: "ユタ州", en: "Utah", aliases: [] },
    VT: { ja: "バーモント州", en: "Vermont", aliases: [] },
    VA: { ja: "バージニア州", en: "Virginia", aliases: [] },
    WA: { ja: "ワシントン州", en: "Washington", aliases: [] },
    WV: { ja: "ウェストバージニア州", en: "West Virginia", aliases: [] },
    WI: { ja: "ウィスコンシン州", en: "Wisconsin", aliases: [] },
    WY: { ja: "ワイオミング州", en: "Wyoming", aliases: [] },
  },
  CA: {
    AB: { ja: "アルバータ州", en: "Alberta", aliases: [] },
    BC: { ja: "ブリティッシュコロンビア州", en: "British Columbia", aliases: [] },
    MB: { ja: "マニトバ州", en: "Manitoba", aliases: [] },
    NB: { ja: "ニューブランズウィック州", en: "New Brunswick", aliases: [] },
    NL: { ja: "ニューファンドランド・ラブラドール州", en: "Newfoundland and Labrador", aliases: ["newfoundland"] },
    NS: { ja: "ノバスコシア州", en: "Nova Scotia", aliases: [] },
    ON: { ja: "オンタリオ州", en: "Ontario", aliases: [] },
    PE: { ja: "プリンスエドワードアイランド州", en: "Prince Edward Island", aliases: [] },
    QC: { ja: "ケベック州", en: "Quebec", aliases: [] },
    SK: { ja: "サスカチュワン州", en: "Saskatchewan", aliases: [] },
    NT: { ja: "ノースウエスト準州", en: "Northwest Territories", aliases: [] },
    NU: { ja: "ヌナブト準州", en: "Nunavut", aliases: [] },
    YT: { ja: "ユーコン準州", en: "Yukon", aliases: [] },
  },
  AU: {
    NSW: { ja: "ニューサウスウェールズ州", en: "New South Wales", aliases: [] },
    VIC: { ja: "ビクトリア州", en: "Victoria", aliases: [] },
    QLD: { ja: "クイーンズランド州", en: "Queensland", aliases: [] },
    WA: { ja: "西オーストラリア州", en: "Western Australia", aliases: [] },
    SA: { ja: "南オーストラリア州", en: "South Australia", aliases: [] },
    TAS: { ja: "タスマニア州", en: "Tasmania", aliases: [] },
    ACT: { ja: "オーストラリア首都特別地域", en: "Australian Capital Territory", aliases: [] },
    NT: { ja: "北部準州", en: "Northern Territory", aliases: [] },
  },
}

/**
 * The spelling a lookup compares: case, accents, punctuation and spacing are
 * how the same name differs between applicants, and never what tells two
 * names apart.
 */
function fold(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "")
}

/**
 * Words applicants add around a state's name. Stripped only after the plain
 * spelling failed, so that `Washington` stays a state and does not lose to a
 * rule meant for `State of Washington`.
 */
const REGION_NOISE = /^(stateof|provinceof)|(state|province|territory)$/

/** Two entries sharing a spelling would let the later one win silently. */
function index(table: Table): Map<string, Name & { code: string }> {
  const byKey = new Map<string, Name & { code: string }>()
  for (const [code, entry] of Object.entries(table)) {
    for (const spelling of [code, entry.en, ...entry.aliases]) {
      const key = fold(spelling)
      const held = byKey.get(key)
      if (held !== undefined && held.code !== code) {
        throw new Error(`"${spelling}" names both ${held.code} and ${code}`)
      }
      byKey.set(key, { code, ja: entry.ja, en: entry.en })
    }
  }
  return byKey
}

const COUNTRY_INDEX = index(COUNTRIES)
const REGION_INDEX = new Map(Object.entries(REGIONS).map(([country, table]) => [country, index(table)]))

function lookup<T>(byKey: Map<string, T>, value: string, noise?: RegExp): T | undefined {
  const key = fold(value)
  if (key === "") return undefined
  const plain = byKey.get(key)
  if (plain !== undefined || noise === undefined) return plain
  const stripped = key.replace(noise, "")
  return stripped === "" ? undefined : byKey.get(stripped)
}

/**
 * Upstream's country and state line as one name per language:
 * `アメリカ合衆国 (マサチューセッツ州)` / `Massachusetts, United States`.
 * An empty or `N/A` country gives two empty strings.
 */
export function countryName(country: string, region: string): Bilingual {
  const raw = country.trim()
  if (fold(raw) === "" || fold(raw) === "na") return { ja: "", en: "" }
  const name = lookup(COUNTRY_INDEX, raw)
  if (name === undefined) return { ja: raw, en: raw }
  const regions = REGION_INDEX.get(name.code)
  const state = regions === undefined ? undefined : lookup(regions, region, REGION_NOISE)
  if (state === undefined) return { ja: name.ja, en: name.en }
  return { ja: `${name.ja} (${state.ja})`, en: `${state.en}, ${name.en}` }
}
