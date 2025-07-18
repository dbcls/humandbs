import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_main/$lang/_layout/achievements/")({
  component: RouteComponent,
  pendingComponent: () => <div>Loading...</div>,
})

function RouteComponent() {
  return <div>Hello "/results/"!</div>
}
