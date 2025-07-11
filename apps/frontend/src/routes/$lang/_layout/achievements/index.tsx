import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/$lang/_layout/achievements/")({
  component: RouteComponent,
  pendingComponent: () => <div>Loading...</div>,
})

function RouteComponent() {
  return <div>Hello "/results/"!</div>
}
