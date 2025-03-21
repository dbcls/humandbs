import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from "lucide-react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";

export const Route = createLazyFileRoute("/(other)/_layout/research-list/")({
  component: RouteComponent,
});

function Caption() {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">研究一覧</h3>

      <div className="flex gap-4">
        <div className="flex gap-1">
          <Button variant={"tableAction"}>Copy</Button>
          <Button variant={"tableAction"}>CSV</Button>
          <Button variant={"tableAction"}>Excel</Button>
        </div>

        <Input
          type="text"
          placeholder="検索"
          beforeIcon={<Search size={22} />}
        />
      </div>
    </div>
  );
}

export interface ResearchData {
  researchId: string;

  datasets: string[];
  title: string;
  publicationDate: string;
  dataType: string;
  methodology: string;
  instrument: string;
  subjects: { content: string[]; type: string | null }[];
}

const data: ResearchData[] = [
  {
    researchId: "hum0490.v1",
    datasets: ["JGAS000770"],
    title:
      "Progestin-primed ovarian stimulation (PPOS) 法を用いた調節卵巣刺激でプログステロン製剤が卵胞発育・卵子の成熟過程に及ぼす影響に関する検討",
    publicationDate: "v1:2024/12/18",
    dataType: "NGS scRNA-seq",
    methodology: "発現",
    instrument: "MGI DNBSEQ-G400",
    subjects: [
      { content: ["正常卵巣機能を有する不妊症: 16症例"], type: "日本人" },
    ],
  },
  {
    researchId: "hum0486.v1",
    datasets: ["JGAS000765"],
    title:
      "胆道閉鎖症およびアラジール症候群由来iPS細胞を用いた胆管発生およびその障害メカニズムの解明",
    publicationDate: "v1:2024/11/29",
    dataType: "NGS WGS",
    methodology: "配列決定",
    instrument: "Illumina NovaSeq X Plus 25B",
    subjects: [{ content: ["胆道閉鎖症: 5症例"], type: "日本人" }],
  },
  {
    researchId: "hum0481.v1",
    datasets: ["JGAS000755"],
    title:
      "日本人高齢者多い疾患のゲノム解析および臨床ゲノム情報ストレージの整備",
    publicationDate: "v1:2024/11/25",
    dataType: "NGS RNA-seq",
    methodology: "発現",
    instrument: "Illumina NovaSeq 6000",
    subjects: [{ content: ["アルツハイマー病: 424症例"], type: "日本人" }],
  },
  {
    researchId: "hum0477.v1",
    datasets: ["JGAS000740"],
    title:
      "消化管癌・消化管腫瘍の組織検査による癌発育・進展メカニズムに関する研究",
    publicationDate: "v1:2024/10/16",
    dataType: "NGS RNA-seq",
    methodology: "発現",
    instrument: "Illumina NextSeq 1000",
    subjects: [
      { content: ["大腸癌患者由来の腸管オルガノイド: 1検体"], type: "日本人" },
      { content: ["Caco-2細胞: 1検体"], type: "細胞株" },
    ],
  },
  {
    researchId: "hum0474.v1",
    datasets: ["JGAS000731"],
    title: "自閉スペクトラム症・統合失調症・双極性障害関連遺伝子の解析",
    publicationDate: "v1:2024/08/22",
    dataType: "NGS Target Capture",
    methodology: "配列決定",
    instrument: "Illumina iSeq 100",
    subjects: [
      {
        content: [
          "自閉スペクトラム症患者: 32症例",
          "健康者生後1歳: 82名",
          "健康者自閉スペクトラム症患者: 5症例",
          "定型発達児: 36名",
        ],
        type: "日本人",
      },
    ],
  },
  {
    researchId: "hum0472.v1",
    datasets: ["JGAS000726"],
    title: "iPS細胞を用いた大脳皮質神経細胞製剤の開発に向けた非臨床研究",
    publicationDate: "v1:2024/08/23",
    dataType: "NGS scRNA-seq",
    methodology: "発現",
    instrument: "Illumina NovaSeq 6000",
    subjects: [
      {
        content: [
          "健常者1名から樹立されたiPS細胞から分化誘導したオルガノイド: 9個",
        ],
        type: null,
      },
    ],
  },
  {
    researchId: "hum0469.v1",
    datasets: ["JGAS000728"],
    title: "妊娠中のサイトメガロウイルス炎応答の検討",
    publicationDate: "v1:2024/08/14",
    dataType: "NGS scRNA-seq",
    methodology: "発現",
    instrument: "Illumina NovaSeq 6000",
    subjects: [
      {
        content: ["妊娠12週, 16週, 20週, 28週, 36週週週の妊婦: 10名"],
        type: "日本人",
      },
    ],
  },
  {
    researchId: "hum0433.v1",
    datasets: [
      "JGAS000659",
      "JGAS000660",
      "JGAS000667",
      "E-GEAD-665",
      "E-GEAD-667",
    ],
    title: "ヒト胎盤栄養膜細胞の樹立と細胞特性に関する基礎研究",
    publicationDate: "v1:2024/09/25",
    dataType:
      "NGS RNA-seq, ChIP-seq, Hi-C, small RNA-seq, CUT&TAG-seq, Methyl-seq",
    methodology: "発現, クロマチン構造, ヒストン修飾, メチル化",
    instrument: "Illumina NovaSeq 6000, HiSeq 2500",
    subjects: [
      {
        content: [
          "ヒト妊娠絨毛栄養膜の初期盤座: 1検体",
          "受精卵: 1検体",
          "妊娠初期絨毛膜盤座由来胎児の細胞膜層: 14症例",
          "胎盤組織: 12名",
        ],
        type: "日本人",
      },
    ],
  },
];

const columnHelper = createColumnHelper<ResearchData>();

const columns = [
  columnHelper.accessor("researchId", {
    id: "researchId",
    header: (ctx) => {
      const sortDirection = ctx.column.getIsSorted();

      const sortIcon =
        sortDirection === "desc" ? (
          <ChevronDown size={18} />
        ) : sortDirection === "asc" ? (
          <ChevronUp size={18} />
        ) : (
          <ChevronsUpDown size={18} />
        );

      return (
        <div className="flex items-center whitespace-nowrap">
          {" "}
          <div>Research ID </div>
          <Button
            onClick={ctx.column.getToggleSortingHandler()}
            variant={"plain"}
            className="p-0"
          >
            {sortIcon}
          </Button>
        </div>
      );
    },
    cell: function Cell(ctx) {
      const researchIdWithVer = ctx.getValue();

      const researchId = researchIdWithVer.split(".")[0];
      const researchVer = researchIdWithVer.split(".")[1];

      return (
        <div>
          <Link
            to="/research-list/$researchId/$researchVer"
            params={{ researchId, researchVer }}
          >
            <TextWithIcon
              className="text-foreground-dark"
              icon={FA_ICONS.books}
            >
              {ctx.getValue()}
            </TextWithIcon>
          </Link>
          <ul>
            {ctx.row.original.datasets.map((dataset) => (
              <li key={dataset}>
                <TextWithIcon
                  className="text-secondary"
                  icon={FA_ICONS.dataset}
                >
                  {dataset}
                </TextWithIcon>
              </li>
            ))}
          </ul>
        </div>
      );
    },
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: "研究題目",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("publicationDate", {
    id: "publicationDate",
    header: "公開日",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("dataType", {
    id: "dataType",
    header: "データタイプ",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("methodology", {
    id: "methodology",
    header: "手法",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("instrument", {
    id: "instrument",
    header: "機器",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("subjects", {
    id: "subjects",
    header: "被験者",
    cell: (ctx) =>
      ctx.getValue().map((participant) => (
        <div key={participant.content.join(",")}>
          <ul>
            {participant.content.map((content) => (
              <li key={content}>{content}</li>
            ))}
          </ul>
          {participant.type && (
            <p className="text-secondary text-sm">{participant.type}</p>
          )}
        </div>
      )),
  }),
];
// table using Tanstack table:

function RouteComponent() {
  return (
    <Card caption={<Caption />}>
      <Table className="mt-4" columns={columns} data={data} />
    </Card>
  );
}
