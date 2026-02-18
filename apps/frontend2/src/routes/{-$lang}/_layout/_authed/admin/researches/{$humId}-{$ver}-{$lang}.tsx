import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/{$humId}-{$ver}-{$lang}"
)({
  component: RouteComponent,
  loader: ({ params }) => {},
});

function RouteComponent() {
  return (
    <div>
      Hello "/-$lang/_layout/_authed/admin/researches/$humId-$ver-$lang"!
    </div>
  );
}
