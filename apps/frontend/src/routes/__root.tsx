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

function getPublicOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  const redirectUri = process.env.HUMANDBS_AUTH_REDIRECT_URI;
  if (!redirectUri) throw new Error("HUMANDBS_AUTH_REDIRECT_URI is required for SEO metadata.");
  return new URL(redirectUri).origin;
}

export const Route = createRootRouteWithContext<Context>()({
  beforeLoad: async () => {
    const { user, session } = await $getAuthUser();
    return {
      user,
      session,
    };
  },
  head: ({ matches }) => {
    const pathname = matches[matches.length - 1]?.pathname ?? "/";

    return {
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
          title: "HumanDBs",
          description: `HumanDBs - databases of researches`,
          image: "/favicon-48x48.ico",
          url: new URL(pathname, getPublicOrigin()).href,
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
    };
  },
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

        {process.env.NODE_ENV === "development" ? (
          <>
            <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
            <TanStackRouterDevtools position="bottom-left" />
          </>
        ) : null}

        <SessionRefreshHandler session={session} />
        <ConfirmationDialog />
        <Scripts />
      </body>
    </html>
  );
}
