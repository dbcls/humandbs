import { i18n, type Locale, type Messages } from "@/config/i18n-config";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, LocationRewrite } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";
import { SessionUser } from "./serverFunctions/user";
import type { SessionMeta } from "@/utils/jwt-helpers";

export type Context = {
  queryClient: QueryClient;
  // auth: Auth;
  crumb: string;
  lang: Locale;
  messages: Messages;
  user: SessionUser | null | undefined;
  session: SessionMeta | null | undefined;
};

/**
 * Tanstack Router's rewrite feature - to handle optional locale params
 * along with widlcard params, i.e. `/{$-lang}/$`. So the "/foo" would
 * be seen as /${defaultLang}/foo, instead of trying to get lang "foo" of the index
 *
 *  `input` sees the real URL the browser requested and can remap it
 *  to whatever internal shape you prefer before route matching runs.
 *
 * `output` runs so you can translate the internal form back to the public form.
 */
function localeRewrite(): LocationRewrite {
  return {
    input: ({ url }) => {
      // console.log("input href", url.href, url.pathname);
      const parts = url.pathname.split("/").slice(1);

      console.log("parts", parts, parts.join("/"));

      const [maybeLocale] = parts;

      console.log("maybeLocale", maybeLocale);

      if (
        maybeLocale &&
        (maybeLocale.startsWith(".") ||
          maybeLocale === "api" ||
          maybeLocale === "assets" ||
          maybeLocale === "favicon.ico")
      ) {
        return url;
      }

      if (!i18n.locales.includes(maybeLocale as Locale)) {
        url.pathname = `/${i18n.defaultLocale}/${parts.join("/")}`;
      }

      return url;
    },
    output: ({ url }) => {
      const parts = url.pathname.split("/").slice(1);
      if (parts[0] === i18n.defaultLocale) {
        parts.shift();
        url.pathname = parts.length ? `/${parts.join("/")}` : "/";
      }
      return url;
    },
  };
}

export async function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    } as Context,
    defaultPreload: "intent",
    scrollRestoration: true,
    rewrite: localeRewrite(),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
