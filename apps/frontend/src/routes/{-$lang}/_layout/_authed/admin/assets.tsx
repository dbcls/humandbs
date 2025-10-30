import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/{-$lang}/_layout/_authed/admin/assets')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/-$lang/_layout/_authed/admin/assets"!</div>
}
