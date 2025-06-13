import { createFileRoute } from "@tanstack/react-router"

import { CardWithCaption } from "@/components/Card"

export const Route = createFileRoute(
  "/(other)/_layout/research-list/$researchId/",
)({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return (
    <CardWithCaption size={"lg"} variant={"dark"} caption={<h2> title</h2>}>

      hello research ID {params.researchId}{" "}
    </CardWithCaption>
  )
}
