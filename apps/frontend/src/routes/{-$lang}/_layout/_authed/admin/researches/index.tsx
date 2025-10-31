import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { lang } = Route.useRouteContext();

  const navigate = useNavigate();
  return (
    <Card
      className="relative flex h-full flex-1 flex-col"
      caption="Researches"
      containerClassName="h-full"
    >
      <div className="flex justify-between">
        <Button
          variant={"accent"}
          onClick={() =>
            navigate({
              to: "/{-$lang}/admin/researches/create",
              params: { lang },
            })
          }
        >
          Add New
        </Button>
      </div>
      <div>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
        <p>hum0123</p>
      </div>
    </Card>
  );
}
