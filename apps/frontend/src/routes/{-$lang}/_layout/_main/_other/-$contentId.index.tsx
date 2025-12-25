import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/$contentId/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  return (
    <div>
      Hello "/-$lang/_layout/_main/_other/$contentId/"!
      <p>
        {Object.entries(params).map(([key, val]) => (
          <p key={key}>
            {key}:{val}
          </p>
        ))}
      </p>
    </div>
  );
}
