import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/data-provision/")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/data-provision/"!</div>
}
