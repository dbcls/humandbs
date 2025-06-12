import { createFileRoute, useNavigate } from "@tanstack/react-router";

import InfographicsImg from "@/assets/Infographics.png";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { News, NewsItem } from "@/components/FrontNews";

export const Route = createFileRoute("/(front)/")({
  component: Index,
});

const dummyNews: NewsItem[] = [
  {
    date: "2024/12/25",
    href: "#",
    title: "制限公開データ（Type I）1件が追加されました（hum0423.v2）",
  },
  {
    date: "2021/09/01",
    href: "#",
    title:
      "大阪大学大学院医学系研究科 産科学婦人科学講座 からの制限公開データ（Type I）を公開しました（hum0490）",
  },
];

function Index() {
  const navigate = useNavigate();

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8">
      {/* // hero component */}
      <section className="flex h-fit justify-between gap-8">
        <article className="mt-8 ml-8 max-w-2xl shrink">
          <h1 className="text-secondary text-3xl font-bold">
            NBDCヒトデータベースについて
          </h1>

          <p>
            ヒトに関するデータは、次世代シークエンサーをはじめとした解析技術の発達に伴って膨大な量が産生されつつあり、それらを整理・格納して、生命科学の進展のために有効に活用するためのルールや仕組みが必要です。
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button variant={"accent"} size={"lg"}>
              データを提供される方
            </Button>

            <Button
              variant={"action"}
              size={"lg"}
              onClick={() => {
                navigate({ to: "/research-list" });
              }}
            >
              {" "}
              データを利用される方
            </Button>
          </div>
        </article>

        <Card caption="新着情報" className="w-80 shrink-0">
          <News news={dummyNews} />
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <Infographics />
      </Card>
    </section>
  );
}

type InfographicsItem = {
  id: string;
  title: string;
  amount: number;
  parent: string | null;
};

const info: InfographicsItem[] = [
  {
    id: "1",
    title: "NGS",
    amount: 100,
    parent: null,
  },
];

function Infographics() {
  return (
    <img src={InfographicsImg} alt="Infographics" className="w-full"></img>
  );
}
