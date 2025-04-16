import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/(other)/_layout/achievements/")({
  component: RouteComponent,
  pendingComponent: () => <div>Loading...</div>,
})

function RouteComponent() {
  return <div>Hello "/results/"!</div>
}
