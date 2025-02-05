import { createLazyFileRoute } from "@tanstack/react-router"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { News, NewsItem } from "@/components/FrontNews"

export const Route = createLazyFileRoute("/")({
  component: Index,

})

const dummyNews: NewsItem[] = [
  { date: "2024/12/25", href: "#", title: "制限公開データ（Type I）1件が追加されました（hum0423.v2）" },
  { date: "2021/09/01", href: "#", title: "大阪大学大学院医学系研究科 産科学婦人科学講座 からの制限公開データ（Type I）を公開しました（hum0490）" },
]

function Index() {
  return (
    // after the Navbar component
    <section>
      {/* // hero component */}
      <section className=" flex h-48 justify-between gap-8">

        <article className=" ml-8 mt-8 max-w-2xl shrink">
          <h1 className="text-secondary text-3xl font-bold">NBDCヒトデータベースについて</h1>

          <p>ヒトに関するデータは、次世代シークエンサーをはじめとした解析技術の発達に伴って膨大な量が産生されつつあり、それらを整理・格納して、生命科学の進展のために有効に活用するためのルールや仕組みが必要です。
          </p>

          <div className=" mt-8 flex flex-wrap justify-center gap-4">
            <Button variant={"accent"} >
              データを提供される方
            </Button>

            <Button variant={"action"}>
              データを利用される方
            </Button>

          </div>

        </article>

        <Card caption="新着情報" className=" w-80 shrink-0" >
          <News news={dummyNews} />
        </Card>

      </section>

    </section>

  )
}
