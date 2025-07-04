import { createFileRoute } from "@tanstack/react-router";

import InfographicsImg from "@/assets/Infographics.png";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { News, NewsItem } from "@/components/FrontNews";
import { localeSchema } from "@/lib/i18n-config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { useTranslations } from "use-intl";
import { z } from "zod";

export const Route = createFileRoute("/$lang/")({
  component: Index,
  params: z.object({
    lang: localeSchema,
  }),
  loader: async ({ context }) => {
    const data = await getContent({
      data: { contentId: "front", lang: context.lang },
    });

    return data;
  },
  context() {
    return {
      crumb: "Home",
    };
  },
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
  const { content } = Route.useLoaderData();

  const navigate = Route.useNavigate();

  const t = useTranslations("Front");

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8">
      <section className="flex h-fit items-start justify-between gap-8">
        <div className="flex flex-1 flex-col items-center">
          <RenderMarkdoc content={content} />

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button variant={"accent"} size={"lg"}>
              {t("data-submission-button")}
            </Button>

            <Button
              variant={"action"}
              size={"lg"}
              onClick={() => {
                navigate({ to: "research-list" });
              }}
            >
              {t("data-usage-button")}
            </Button>
          </div>
        </div>

        <Card caption={t("news")} className="w-96 shrink-0">
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
