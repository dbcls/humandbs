import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/(other)/_layout/data-usage/")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/data-usage/"!</div>
}
