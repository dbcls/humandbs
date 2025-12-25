import { i18n } from "@/config/i18n-config";
import { createFileRoute, redirect } from "@tanstack/react-router";

const humPageRegex = /(\d+)(-(v\d+))?/i;

export const Route = createFileRoute("/hum{$humIdNumAndRest}")({
  component: RouteComponent,

  beforeLoad: ({ params }) => {
    const [_, humNum, __, version] = [
      ...(params.humIdNumAndRest.match(humPageRegex) || []),
    ];

    if (!humNum) throw redirect({ to: "/{-$lang}/data-usage/researches" });

    if (!version)
      throw redirect({
        to: "/{-$lang}/data-usage/researches/$humId",
        params: {
          lang: undefined,
          humId: `hum${humNum}`,
        },
      });

    throw redirect({
      to: "/{-$lang}/data-usage/researches/$humId/$version",
      params: {
        lang: undefined,
        humId: `hum${humNum}`,
        version: version || "latest",
      },
    });
  },
});

function RouteComponent() {
  return <div>Hello "/hum-$humIdNumAndRest"!</div>;
}
