import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/achievements/")({
  component: RouteComponent,
  pendingComponent: () => <div>Loading...</div>,
})

function RouteComponent() {
  return <div>Hello "/results/"!</div>
}
