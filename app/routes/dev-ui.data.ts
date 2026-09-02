/**
 * The rows `/dev/ui` draws the parts against.
 *
 * **Real values, frozen.** They were taken once out of the development data, so
 * a title is a title somebody wrote and an accession list is as long as they
 * really get — invented rows make a part look better than it is. Freezing them
 * is what makes the page a baseline: reading the database instead would empty
 * the catalogue every time the database tests run, and then a part that broke
 * and a table with nothing in it would look the same.
 *
 * Refresh by hand when a view's shape changes; the types below are the ones the
 * listings are drawn from, so a change that matters stops the build.
 */

import type { FacetPanelView } from "~/public/facets.server"
import type { NewsSummary } from "~/public/site.server"
import type { ResearchListRowView } from "~/public/view.server"

/** How many rows the search these came from actually matched. */
export const TOTAL = 397

/** The three most recent announcements, as the front page lists them. */
export const NEWS: NewsSummary[] = [
  {
    id: "019ff4fb-317a-7729-9750-80fbd28eb1d1",
    publishedAt: "2026-06-23",
    title: "北里大学医学部 呼吸器内科学 からの制限公開データ（Type I）を公開しました（hum0556）",
    excerpt: "北里大学医学部 呼吸器内科学 から提供された制限公開データ（Type I）を公開しました。詳細は研究のページをご覧ください。",
  },
  {
    id: "019ff4fb-317a-7fa1-bab8-8d05aa631723",
    publishedAt: "2026-06-16",
    title: "制限公開データ（Type I）1件が追加されました（hum0427.v2）",
    excerpt: "hum0427 に制限公開データ（Type I）が 1 件追加されました。",
  },
  {
    id: "019ff4fb-317b-701f-86f1-e751251e4e4c",
    publishedAt: "2026-06-10",
    title: "大阪大学大学院医学系研究科 がんゲノム情報学 からの制限公開データ（Type I）を公開しました（hum0543）",
    excerpt: "",
  },
]

export const ROWS: ResearchListRowView[] = [
  {
    humLabel: "hum0197",
    title: {
      state: "plain",
      text: "多層的オミクス解析による疾患病態の解明",
      untranslated: false,
    },
    datasetLabels: [
      "JGAD000290",
      "JGAD000363",
      "JGAD000427",
      "JGAD000532",
      "JGAD000649",
      "JGAD000650",
      "hum0197.v2.gwas.v1",
      "hum0197.v3.gwas.v1",
      "hum0197.v5.gwas.v1",
      "hum0197.v5.finemap.v1",
      "JGAD000621",
      "hum0197.v6.eqtl.v1",
    ],
    typeOfData: {
      state: "rich",
      text: [
        [
          {
            text: "メタゲノム SNP-chip NGS （WGS、RNA-seq、scRNA-seq、snRNA-seq、snATAC-seq） eHHV-6の有無、アネロウイルス量 プロテオミクス",
          },
        ],
      ],
      untranslated: false,
    },
    methods: {
      state: "rich",
      text: [
        [
          {
            text: "メタゲノム ゲノムワイド関連 発現 eQTL クロマチン構造",
          },
        ],
      ],
      untranslated: false,
    },
    targets: {
      state: "rich",
      text: [
        [
          {
            text: "日本人集団：95＋103＋227＋30＋141＋136＋88＋5＋524名",
          },
        ],
        [
          {
            text: "BBJ：180,215名",
          },
        ],
        [
          {
            text: "UKバイオバンク：377,583名",
          },
        ],
        [
          {
            text: "FinnGen：136,000＋224,352名",
          },
        ],
        [
          {
            text: "BCAC：247,173名",
          },
        ],
        [
          {
            text: "PRACTICAL：140,254名",
          },
        ],
        [
          {
            text: "肺胞蛋白症：198症例",
          },
        ],
        [
          {
            text: "対照者：395名",
          },
        ],
        [
          {
            text: "潰瘍性大腸炎：35症例",
          },
        ],
        [
          {
            text: "クローン病：39症例",
          },
        ],
        [
          {
            text: "健常対照者：40名",
          },
        ],
        [
          {
            text: "頭蓋内胚細胞腫瘍：133症例",
          },
        ],
        [
          {
            text: "対照者：762名",
          },
        ],
        [
          {
            text: "COVID-19：30＋43＋15症例",
          },
        ],
        [
          {
            text: "健常対照者：31＋44＋27名",
          },
        ],
        [
          {
            text: "健常者：73名",
          },
        ],
        [
          {
            text: "間質性膀胱炎ハンナ型：144症例",
          },
        ],
        [
          {
            text: "2型糖尿病：27,642症例（BBJ）",
          },
        ],
        [
          {
            text: "対照者：70,242名（BBJ）",
          },
        ],
        [
          {
            text: "2型糖尿病：27,642症例（UKバイオバンク）",
          },
        ],
        [
          {
            text: "対照者：70,242名（UKバイオバンク）",
          },
        ],
        [
          {
            text: "不育症：1,728症例",
          },
        ],
        [
          {
            text: "自己免疫疾患：2,238症例",
          },
        ],
        [
          {
            text: "対照者：2,919名",
          },
        ],
        [
          {
            text: "HPV関連中咽頭癌：32症例",
          },
        ],
        [
          {
            text: "HPV非関連中咽頭癌：17症例",
          },
        ],
        [
          {
            text: "対照者：2名",
          },
        ],
        [
          {
            text: "視神経脊髄炎関連疾患：240症例",
          },
        ],
        [
          {
            text: "対照者：50,578名",
          },
        ],
        [
          {
            text: "乾癬：204症例",
          },
        ],
        [
          {
            text: "対照者：1,231名",
          },
        ],
        [
          {
            text: "日本人男性：161,026名（BBJ、JCTF、TMM、COVC、HERPACC、JPHC）",
          },
        ],
        [
          {
            text: "日本人男性気管支喘息：3症例",
          },
        ],
        [
          {
            text: "日本人男性COVID-19：4症例",
          },
        ],
        [
          {
            text: "重症筋無力症：1,434症例",
          },
        ],
        [
          {
            text: "対照者：42,913名",
          },
        ],
        [
          {
            text: "もやもや病：401症例",
          },
        ],
        [
          {
            text: "多発性硬化症：20症例",
          },
        ],
        [
          {
            text: "多発性硬化症：688症例（日本人集団）",
          },
        ],
        [
          {
            text: "対照者：205,199名",
          },
        ],
        [
          {
            text: "多発性硬化症：27,572症例（ヨーロッパ人集団）",
          },
        ],
        [
          {
            text: "対照者：1,436,801名",
          },
        ],
        [
          {
            text: "多発性硬化症：819症例（アフリカ人集団）",
          },
        ],
        [
          {
            text: "対照者：155,904名",
          },
        ],
        [
          {
            text: "多発性硬化症：295症例（アメリカ人集団）",
          },
        ],
        [
          {
            text: "対照者：45,569名",
          },
        ],
        [
          {
            text: "（日本人、イギリス人、フィンランド人、アフリカ人、アメリカ人）",
          },
        ],
      ],
      untranslated: false,
    },
    platforms: [
      {
        code: "illumina-hiseq-2500",
        label: "Illumina HiSeq 2500",
        maker: "Illumina",
      },
      {
        code: "illumina-hiseq-x-ten",
        label: "Illumina HiSeq X Ten",
        maker: "Illumina",
      },
      {
        code: "illumina-hiseq-2500-3000-novaseq-6000",
        label: "Illumina HiSeq 2500/3000, NovaSeq 6000",
        maker: "Illumina",
      },
      {
        code: "illumina-novaseq-6000",
        label: "Illumina NovaSeq 6000",
        maker: "Illumina",
      },
      {
        code: "illumina-hiseq-3000",
        label: "Illumina HiSeq 3000",
        maker: "Illumina",
      },
      {
        code: "illumina-hiseq-x",
        label: "Illumina HiSeq X",
        maker: "Illumina",
      },
      {
        code: "olink-olink-explore-3072",
        label: "Olink Olink Explore 3072",
        maker: "Olink",
      },
      {
        code: "illumina-humanomniexpressexome",
        label: "Illumina HumanOmniExpressExome",
        maker: "Illumina",
      },
      {
        code: "illumina-humanomniexpress",
        label: "Illumina HumanOmniExpress",
        maker: "Illumina",
      },
      {
        code: "illumina-humanexome",
        label: "Illumina HumanExome",
        maker: "Illumina",
      },
      {
        code: "illumina-humanomniexpress-beadchip",
        label: "Illumina HumanOmniExpress BeadChip",
        maker: "Illumina",
      },
      {
        code: "illumina-humanomniexpressexome-beadchip",
        label: "Illumina HumanOmniExpressExome BeadChip",
        maker: "Illumina",
      },
      {
        code: "illumina-humanexome-beadchip",
        label: "Illumina HumanExome BeadChip",
        maker: "Illumina",
      },
      {
        code: "uk-biobank-applied-biosystems-uk-bileve-axiom-array",
        label: "UK Biobank: Applied Biosystems UK BiLEVE Axiom Array",
        maker: null,
      },
      {
        code: "uk-biobank-applied-biosystems-uk-biobank-axiom-array",
        label: "UK Biobank: Applied Biosystems UK Biobank Axiom Array",
        maker: null,
      },
      {
        code: "applied-biosystems-uk-bileve-axiom-array",
        label: "Applied Biosystems UK BiLEVE Axiom Array",
        maker: "Applied Biosystems",
      },
      {
        code: "applied-biosystems-uk-biobank-axiom-array",
        label: "Applied Biosystems UK Biobank Axiom Array",
        maker: "Applied Biosystems",
      },
      {
        code: "thermo-fisher-scientific-finngen1-thermofisher-array",
        label: "Thermo Fisher Scientific FinnGen1 ThermoFisher Array",
        maker: "Thermo Fisher Scientific",
      },
      {
        code: "illumina-icogs-oncoarray",
        label: "Illumina iCOGS OncoArray",
        maker: "Illumina",
      },
      {
        code: "illumina-infinium-asian-screening-array",
        label: "Illumina Infinium Asian Screening Array",
        maker: "Illumina",
      },
      {
        code: "illumina-humanomniexpressexome-beadchip-humanomniexpress-beadchip-humanexome-beadchip",
        label: "Illumina HumanOmniExpressExome BeadChip, HumanOmniExpress BeadChip, HumanExome BeadChip",
        maker: "Illumina",
      },
      {
        code: "illumina-novaseq-6000-hiseq-x-ten",
        label: "Illumina NovaSeq 6000/HiSeq X Ten",
        maker: "Illumina",
      },
      {
        code: "thermo-fisher-scientific-axiom-japonica-array-v2",
        label: "Thermo Fisher Scientific Axiom Japonica Array v2",
        maker: "Thermo Fisher Scientific",
      },
      {
        code: "illumina-novaseq-x-plus",
        label: "Illumina NovaSeq X Plus",
        maker: "Illumina",
      },
      {
        code: "mgi-dnbseq-t7",
        label: "MGI DNBSEQ-T7",
        maker: "MGI",
      },
    ],
    accessTypes: [
      {
        code: "unrestricted-access",
        label: "非制限公開",
        maker: null,
      },
      {
        code: "controlled-access-type-1",
        label: "制限公開（Type I）",
        maker: null,
      },
    ],
    dataProviders: [
      {
        state: "plain",
        text: "岡田 随象",
        untranslated: false,
      },
    ],
    datePublished: "2019-11-15",
    dateModified: "2026-07-31",
  },
  {
    humLabel: "hum0210",
    title: {
      state: "plain",
      text: "造血器腫瘍における遺伝子異常の網羅的解析",
      untranslated: false,
    },
    datasetLabels: [
      "JGAD000297",
      "JGAD001065",
    ],
    typeOfData: {
      state: "rich",
      text: [
        [
          {
            text: "NGS （Exome、RNA-seq）",
          },
        ],
      ],
      untranslated: false,
    },
    methods: {
      state: "rich",
      text: [
        [
          {
            text: "配列決定 発現",
          },
        ],
      ],
      untranslated: false,
    },
    targets: {
      state: "rich",
      text: [
        [
          {
            text: "急性骨髄性白血病と縦隔胚細胞腫瘍の合併症例：1症例",
          },
        ],
        [
          {
            text: "成人T細胞白血病リンパ腫：5症例",
          },
        ],
        [
          {
            text: "（日本人）",
          },
        ],
      ],
      untranslated: false,
    },
    platforms: [
      {
        code: "illumina-nextseq-500",
        label: "Illumina NextSeq 500",
        maker: "Illumina",
      },
      {
        code: "mgi-dnbseq-g400",
        label: "MGI DNBSEQ-G400",
        maker: "MGI",
      },
    ],
    accessTypes: [
      {
        code: "controlled-access-type-1",
        label: "制限公開（Type I）",
        maker: null,
      },
    ],
    dataProviders: [
      {
        state: "plain",
        text: "下田 和哉",
        untranslated: false,
      },
    ],
    datePublished: "2020-04-06",
    dateModified: "2026-07-30",
  },
  {
    humLabel: "hum0511",
    title: {
      state: "plain",
      text: "百寿者サンプルを用いた老化における分子マーカーの探索と分子基盤の解明",
      untranslated: false,
    },
    datasetLabels: [
      "JGAD000957",
      "E-GEAD-1107",
      "E-GEAD-1108",
    ],
    typeOfData: {
      state: "rich",
      text: [
        [
          {
            text: "NGS（scRNA-seq、scTCR-seq、scCITE-seq）",
          },
        ],
      ],
      untranslated: false,
    },
    methods: {
      state: "rich",
      text: [
        [
          {
            text: "発現",
          },
        ],
      ],
      untranslated: false,
    },
    targets: {
      state: "rich",
      text: [
        [
          {
            text: "健常者：28名",
          },
        ],
        [
          {
            text: "（日本人）",
          },
        ],
      ],
      untranslated: false,
    },
    platforms: [
      {
        code: "mgi-tech-mgiseq-2000rs",
        label: "MGI Tech MGISEQ-2000RS",
        maker: "MGI",
      },
    ],
    accessTypes: [
      {
        code: "unrestricted-access",
        label: "非制限公開",
        maker: null,
      },
      {
        code: "controlled-access-type-1",
        label: "制限公開（Type I）",
        maker: null,
      },
    ],
    dataProviders: [
      {
        state: "plain",
        text: "橋本 浩介",
        untranslated: false,
      },
    ],
    datePublished: "2026-07-30",
    dateModified: "2026-07-30",
  },
  {
    humLabel: "hum0574",
    title: {
      state: "plain",
      text: "悪性腫瘍におけるゲノム解析データベース構築に関する研究",
      untranslated: false,
    },
    datasetLabels: [
      "JGAD001063",
      "JGAD001064",
    ],
    typeOfData: {
      state: "rich",
      text: [
        [
          {
            text: "NGS（Exome、RNA-seq）",
          },
        ],
      ],
      untranslated: false,
    },
    methods: {
      state: "rich",
      text: [
        [
          {
            text: "配列決定、発現",
          },
        ],
      ],
      untranslated: false,
    },
    targets: {
      state: "rich",
      text: [
        [
          {
            text: "直腸癌:2症例、胃腺癌:4症例（日本人）",
          },
        ],
      ],
      untranslated: false,
    },
    platforms: [
      {
        code: "illumina-novaseq-6000",
        label: "Illumina NovaSeq 6000",
        maker: "Illumina",
      },
    ],
    accessTypes: [
      {
        code: "controlled-access-type-1",
        label: "制限公開（Type I）",
        maker: null,
      },
    ],
    dataProviders: [
      {
        state: "plain",
        text: "島田 能史",
        untranslated: false,
      },
      {
        state: "plain",
        text: "市川 寛",
        untranslated: false,
      },
    ],
    datePublished: "2026-07-24",
    dateModified: "2026-07-24",
  },
  {
    humLabel: "hum0588",
    title: {
      state: "plain",
      text: "ヒトiPS細胞における正確なゲノム編集条件の探索による疾患モデルおよび細胞移植治療法の開発",
      untranslated: false,
    },
    datasetLabels: [
      "JGAD001067",
    ],
    typeOfData: {
      state: "rich",
      text: [
        [
          {
            text: "NGS（RNA-seq）",
          },
        ],
      ],
      untranslated: false,
    },
    methods: {
      state: "rich",
      text: [
        [
          {
            text: "発現",
          },
        ],
      ],
      untranslated: false,
    },
    targets: {
      state: "rich",
      text: [
        [
          {
            text: "未分化iPS細胞および分化誘導した心筋細胞：12検体（細胞株）",
          },
        ],
      ],
      untranslated: false,
    },
    platforms: [
      {
        code: "mgi-tech-dnbseq-g400",
        label: "MGI Tech DNBSEQ-G400",
        maker: "MGI",
      },
    ],
    accessTypes: [
      {
        code: "controlled-access-type-1",
        label: "制限公開（Type I）",
        maker: null,
      },
    ],
    dataProviders: [
      {
        state: "plain",
        text: "宮岡 佑一郎",
        untranslated: false,
      },
    ],
    datePublished: "2026-07-19",
    dateModified: "2026-07-19",
  },
]

/** Nothing chosen: every facet closed but the first group. */
export const FACETS: FacetPanelView = {
  categories: [
    {
      code: "basic-info",
      label: null,
      facets: [
        {
          code: "date_published",
          label: "公開日",
          kind: "date",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "",
            to: "",
            min: "2015-04-01",
            max: "2026-08-24",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
        {
          code: "date_modified",
          label: "更新日",
          kind: "date",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "2024-01-01",
            to: "",
            min: "2016-02-10",
            max: "2026-08-24",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
        {
          code: "access-criteria",
          label: "アクセス制限",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "controlled-access-type-1",
              label: "制限公開（Type I）",
              maker: null,
              count: 348,
              selected: false,
              href: "/research?q=access-criteria%3Acontrolled-access-type-1",
              children: [],
            },
            {
              code: "unrestricted-access",
              label: "非制限公開",
              maker: null,
              count: 80,
              selected: false,
              href: "/research?q=access-criteria%3Aunrestricted-access",
              children: [],
            },
            {
              code: "controlled-access-type-2",
              label: "制限公開（Type II）",
              maker: null,
              count: 2,
              selected: false,
              href: "/research?q=access-criteria%3Acontrolled-access-type-2",
              children: [],
            },
          ],
          moreHref: null,
          range: null,
          codeEntry: null,
        },
      ],
    },
    {
      code: "subjects",
      label: "対象者",
      facets: [
        {
          code: "disease-icd10",
          label: "疾患 (ICD10)",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "C34",
              label: "Primary lung cancer",
              maker: null,
              count: 33,
              selected: false,
              href: "/research?q=disease-icd10%3AC34",
              children: [],
            },
            {
              code: "C18",
              label: "Colorectal cancer",
              maker: null,
              count: 31,
              selected: false,
              href: "/research?q=disease-icd10%3AC18",
              children: [],
            },
            {
              code: "C22",
              label: "Malignant neoplasm of liver and intrahepatic bile ducts",
              maker: null,
              count: 23,
              selected: false,
              href: "/research?q=disease-icd10%3AC22",
              children: [],
            },
            {
              code: "C16",
              label: "Gastric cancer",
              maker: null,
              count: 20,
              selected: false,
              href: "/research?q=disease-icd10%3AC16",
              children: [],
            },
            {
              code: "C50",
              label: "Breast cancer",
              maker: null,
              count: 17,
              selected: false,
              href: "/research?q=disease-icd10%3AC50",
              children: [],
            },
          ],
          moreHref: "/research?facet=disease-icd10",
          range: null,
          codeEntry: null,
        },
        {
          code: "subject-count",
          label: "対象者数",
          kind: "number",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "",
            to: "",
            min: "1",
            max: "1,872,937",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
      ],
    },
    {
      code: "samples",
      label: "検体",
      facets: [
        {
          code: "tissue",
          label: "組織",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "peripheral-blood",
              label: "peripheral blood",
              maker: null,
              count: 158,
              selected: false,
              href: "/research?q=tissue%3Aperipheral-blood",
              children: [],
            },
            {
              code: "tumor-tissue",
              label: "tumor tissue",
              maker: null,
              count: 114,
              selected: false,
              href: "/research?q=tissue%3Atumor-tissue",
              children: [],
            },
            {
              code: "normal-tissue",
              label: "normal tissue",
              maker: null,
              count: 55,
              selected: false,
              href: "/research?q=tissue%3Anormal-tissue",
              children: [],
            },
            {
              code: "pbmc",
              label: "PBMC",
              maker: null,
              count: 25,
              selected: false,
              href: "/research?q=tissue%3Apbmc",
              children: [],
            },
            {
              code: "bone-marrow",
              label: "bone marrow",
              maker: null,
              count: 19,
              selected: false,
              href: "/research?q=tissue%3Abone-marrow",
              children: [],
            },
          ],
          moreHref: "/research?facet=tissue",
          range: null,
          codeEntry: null,
        },
      ],
    },
    {
      code: "experiment",
      label: "実験",
      facets: [
        {
          code: "experimental-method",
          label: "実験方法",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "rna-seq",
              label: "RNA-seq",
              maker: null,
              count: 143,
              selected: false,
              href: "/research?q=experimental-method%3Arna-seq",
              children: [],
            },
            {
              code: "wes",
              label: "WES",
              maker: null,
              count: 120,
              selected: false,
              href: "/research?q=experimental-method%3Awes",
              children: [],
            },
            {
              code: "targeted-dna-sequencing",
              label: "Targeted DNA sequencing",
              maker: null,
              count: 74,
              selected: false,
              href: "/research?q=experimental-method%3Atargeted-dna-sequencing",
              children: [],
            },
            {
              code: "wgs",
              label: "WGS",
              maker: null,
              count: 70,
              selected: false,
              href: "/research?q=experimental-method%3Awgs",
              children: [],
            },
            {
              code: "scrna-seq",
              label: "scRNA-seq",
              maker: null,
              count: 56,
              selected: false,
              href: "/research?q=experimental-method%3Ascrna-seq",
              children: [],
            },
          ],
          moreHref: "/research?facet=experimental-method",
          range: null,
          codeEntry: null,
        },
        {
          code: "platform",
          label: "プラットフォーム",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "illumina-novaseq-6000",
              label: "Illumina NovaSeq 6000",
              maker: "Illumina",
              count: 127,
              selected: false,
              href: "/research?q=platform%3Aillumina-novaseq-6000",
              children: [],
            },
            {
              code: "illumina-hiseq-2500",
              label: "Illumina HiSeq 2500",
              maker: "Illumina",
              count: 103,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-2500",
              children: [],
            },
            {
              code: "illumina-hiseq-2000",
              label: "Illumina HiSeq 2000",
              maker: "Illumina",
              count: 61,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-2000",
              children: [],
            },
            {
              code: "illumina-miseq",
              label: "Illumina MiSeq",
              maker: "Illumina",
              count: 23,
              selected: false,
              href: "/research?q=platform%3Aillumina-miseq",
              children: [],
            },
            {
              code: "illumina-hiseq-x-ten",
              label: "Illumina HiSeq X Ten",
              maker: "Illumina",
              count: 21,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-x-ten",
              children: [],
            },
          ],
          moreHref: "/research?facet=platform",
          range: null,
          codeEntry: null,
        },
      ],
    },
  ],
  target: "research",
}

/** One value chosen and one facet opened, which is where the panel earns its keep. */
export const REFINED_FACETS: FacetPanelView = {
  categories: [
    {
      code: "basic-info",
      label: null,
      facets: [
        {
          code: "date_published",
          label: "公開日",
          kind: "date",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "",
            to: "",
            min: "2015-04-01",
            max: "2026-08-24",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
        {
          code: "date_modified",
          label: "更新日",
          kind: "date",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "2024-01-01",
            to: "",
            min: "2016-02-10",
            max: "2026-08-24",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
        {
          code: "access-criteria",
          label: "アクセス制限",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: "/research",
          values: [
            {
              code: "controlled-access-type-1",
              label: "制限公開（Type I）",
              maker: null,
              count: 348,
              selected: true,
              href: "/research",
              children: [],
            },
            {
              code: "unrestricted-access",
              label: "非制限公開",
              maker: null,
              count: 80,
              selected: false,
              href: "/research?q=access-criteria%3Aunrestricted-access",
              children: [],
            },
            {
              code: "controlled-access-type-2",
              label: "制限公開（Type II）",
              maker: null,
              count: 2,
              selected: false,
              href: "/research?q=access-criteria%3Acontrolled-access-type-2",
              children: [],
            },
          ],
          moreHref: null,
          range: null,
          codeEntry: null,
        },
      ],
    },
    {
      code: "subjects",
      label: "対象者",
      facets: [
        {
          code: "disease-icd10",
          label: "疾患 (ICD10)",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "C34",
              label: "Primary lung cancer",
              maker: null,
              count: 33,
              selected: false,
              href: "/research?q=disease-icd10%3AC34",
              children: [],
            },
            {
              code: "C18",
              label: "Colorectal cancer",
              maker: null,
              count: 31,
              selected: false,
              href: "/research?q=disease-icd10%3AC18",
              children: [],
            },
            {
              code: "C22",
              label: "Malignant neoplasm of liver and intrahepatic bile ducts",
              maker: null,
              count: 23,
              selected: false,
              href: "/research?q=disease-icd10%3AC22",
              children: [],
            },
            {
              code: "C16",
              label: "Gastric cancer",
              maker: null,
              count: 20,
              selected: false,
              href: "/research?q=disease-icd10%3AC16",
              children: [],
            },
            {
              code: "C50",
              label: "Breast cancer",
              maker: null,
              count: 17,
              selected: false,
              href: "/research?q=disease-icd10%3AC50",
              children: [],
            },
          ],
          moreHref: "/research?facet=disease-icd10",
          range: null,
          codeEntry: null,
        },
        {
          code: "subject-count",
          label: "対象者数",
          kind: "number",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [],
          moreHref: null,
          range: {
            from: "",
            to: "",
            min: "1",
            max: "1,872,937",
            unit: null,
            clearHref: null,
          },
          codeEntry: null,
        },
      ],
    },
    {
      code: "samples",
      label: "検体",
      facets: [
        {
          code: "tissue",
          label: "組織",
          kind: "vocabulary",
          expanded: true,
          find: "",
          closeHref: "/research?q=access-criteria%3Acontrolled-access-type-1",
          clearHref: null,
          values: [
            {
              code: "peripheral-blood",
              label: "peripheral blood",
              maker: null,
              count: 158,
              selected: false,
              href: "/research?q=tissue%3Aperipheral-blood",
              children: [],
            },
            {
              code: "tumor-tissue",
              label: "tumor tissue",
              maker: null,
              count: 114,
              selected: false,
              href: "/research?q=tissue%3Atumor-tissue",
              children: [],
            },
            {
              code: "normal-tissue",
              label: "normal tissue",
              maker: null,
              count: 55,
              selected: false,
              href: "/research?q=tissue%3Anormal-tissue",
              children: [],
            },
            {
              code: "pbmc",
              label: "PBMC",
              maker: null,
              count: 25,
              selected: false,
              href: "/research?q=tissue%3Apbmc",
              children: [],
            },
            {
              code: "bone-marrow",
              label: "bone marrow",
              maker: null,
              count: 19,
              selected: false,
              href: "/research?q=tissue%3Abone-marrow",
              children: [],
            },
          ],
          moreHref: "/research?facet=tissue",
          range: null,
          codeEntry: null,
        },
      ],
    },
    {
      code: "experiment",
      label: "実験",
      facets: [
        {
          code: "experimental-method",
          label: "実験方法",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "rna-seq",
              label: "RNA-seq",
              maker: null,
              count: 143,
              selected: false,
              href: "/research?q=experimental-method%3Arna-seq",
              children: [],
            },
            {
              code: "wes",
              label: "WES",
              maker: null,
              count: 120,
              selected: false,
              href: "/research?q=experimental-method%3Awes",
              children: [],
            },
            {
              code: "targeted-dna-sequencing",
              label: "Targeted DNA sequencing",
              maker: null,
              count: 74,
              selected: false,
              href: "/research?q=experimental-method%3Atargeted-dna-sequencing",
              children: [],
            },
            {
              code: "wgs",
              label: "WGS",
              maker: null,
              count: 70,
              selected: false,
              href: "/research?q=experimental-method%3Awgs",
              children: [],
            },
            {
              code: "scrna-seq",
              label: "scRNA-seq",
              maker: null,
              count: 56,
              selected: false,
              href: "/research?q=experimental-method%3Ascrna-seq",
              children: [],
            },
          ],
          moreHref: "/research?facet=experimental-method",
          range: null,
          codeEntry: null,
        },
        {
          code: "platform",
          label: "プラットフォーム",
          kind: "vocabulary",
          expanded: false,
          find: "",
          closeHref: null,
          clearHref: null,
          values: [
            {
              code: "illumina-novaseq-6000",
              label: "Illumina NovaSeq 6000",
              maker: "Illumina",
              count: 127,
              selected: false,
              href: "/research?q=platform%3Aillumina-novaseq-6000",
              children: [],
            },
            {
              code: "illumina-hiseq-2500",
              label: "Illumina HiSeq 2500",
              maker: "Illumina",
              count: 103,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-2500",
              children: [],
            },
            {
              code: "illumina-hiseq-2000",
              label: "Illumina HiSeq 2000",
              maker: "Illumina",
              count: 61,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-2000",
              children: [],
            },
            {
              code: "illumina-miseq",
              label: "Illumina MiSeq",
              maker: "Illumina",
              count: 23,
              selected: false,
              href: "/research?q=platform%3Aillumina-miseq",
              children: [],
            },
            {
              code: "illumina-hiseq-x-ten",
              label: "Illumina HiSeq X Ten",
              maker: "Illumina",
              count: 21,
              selected: false,
              href: "/research?q=platform%3Aillumina-hiseq-x-ten",
              children: [],
            },
          ],
          moreHref: "/research?facet=platform",
          range: null,
          codeEntry: null,
        },
      ],
    },
  ],
  target: "research",
}
