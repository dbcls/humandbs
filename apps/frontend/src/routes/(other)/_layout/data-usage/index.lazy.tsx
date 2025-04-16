import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/(other)/_layout/data-usage/")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/data-usage/"!</div>
}
