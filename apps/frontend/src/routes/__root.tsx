/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";

import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import { SessionRefreshHandler } from "@/components/SessionRefreshHandler";
import type { Context } from "@/router";
import { $getAuthUser } from "@/serverFunctions/authUser";
import appCss from "@/styles/app.css?url";
import { seo } from "@/utils/seo";

export const Route = createRootRouteWithContext<Context>()({
  beforeLoad: async () => {
    const { user, session } = await $getAuthUser();
    return {
      user,
      session,
    };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: "HumanDSB",
        description: `HumanDBs - databases of researches`,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
    // scripts: [
    //   {
    //     src: "/customScript.js",
    //     type: "text/javascript",
    //   },
    // ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootDocument,
});

function RootDocument() {
  const { lang, session } = Route.useRouteContext();

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="font-family-sans main-bg text-foreground relative h-fit">
        <Outlet />
        <TanStackRouterDevtools position="bottom-left" />
        <SessionRefreshHandler session={session} />
        {/*<ConfirmationDialog />*/}
        <Scripts />
      </body>
    </html>
  );
}
