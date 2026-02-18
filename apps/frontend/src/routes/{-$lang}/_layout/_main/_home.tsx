import { Outlet, createFileRoute } from "@tanstack/react-router";
// import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
// import { Button } from "@/components/ui/button";

// import { News } from "../../-components/FrontNews";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home")({
  component: RouteComponent,
  errorComponent: () => <div>Oh no, an error!</div>,
});

function RouteComponent() {
  // const navigate = Route.useNavigate();

  // const t = useTranslations("Front");

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8">
      <section className="flex h-fit items-start justify-between gap-8">
        <div className="flex flex-1 flex-col items-center">
          <Outlet />
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button
              variant={"accent"}
              // onClick={() => navigate({ to: "/{-$lang}/data-submission" })}
              size={"lg"}
            >
              {"data-submission-button"}
            </Button>

            <Button
              variant={"action"}
              size={"lg"}
              onClick={() => {
                // navigate({ to: "/{-$lang}/data-usage" });
              }}
            >
              {"data-usage-button"}
            </Button>
          </div>
        </div>

        <Card caption={"News"} className="w-96 shrink-0">
          {/*<News />*/}
        </Card>
      </section>
      <Card className="overflow-hidden p-0">{/*<Infographics />*/}</Card>
    </section>
  );
}
