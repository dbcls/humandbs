import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/(other)/_layout/data-provision/")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/data-provision/"!</div>
}
