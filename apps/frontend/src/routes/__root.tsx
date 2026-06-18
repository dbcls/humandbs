/// <reference types="vite/client" />

import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useHydrated,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import ConfirmationDialog from "@/components/ConfirmationDialog";
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
      {
        name: "version",
        content: `${APP_VERSION}_${APP_VERSION_HASH}`,
      },
      ...seo({
        title: "HumanDBS",
        description: `HumanDBs - databases of researches`,
        image: "/favicon-48x48.ico",
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
        sizes: "192x192",
        href: "/favicon-192x192.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "48x48",
        href: "/favicon-48x48.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon.ico",
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

  const isHydrated = useHydrated();

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body
        data-testhydrated={isHydrated}
        className="main-bg relative flex h-screen flex-col bg-primary-translucent font-family-sans text-foreground"
      >
        <Outlet />
        <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
        <TanStackRouterDevtools position="bottom-left" />
        <SessionRefreshHandler session={session} />
        <ConfirmationDialog />
        <Scripts />
      </body>
    </html>
  );
}
