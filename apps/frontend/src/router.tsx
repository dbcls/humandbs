import { QueryClient } from "@tanstack/react-query";
import { createRouter, type LocationRewrite } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import { i18n, type Locale, type Messages } from "@/config/i18n";
import { routeTree } from "@/routeTree.gen";

export interface Context {
  queryClient: QueryClient;
  // auth: Auth;
  crumb: string;
  lang: Locale;
  messages: Messages;
  // user: SessionUser | null | undefined;
  // session: SessionMeta | null | undefined;
}

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    } as Context,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
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
      const parts = url.pathname.split("/").slice(1);

      const [maybeLocale] = parts;

      // 1.if no pathname whatsoever, set it as default lang
      if (!maybeLocale) {
        url.pathname = `/${i18n.defaultLocale}/`;
        return url;
      } else if (
        // if utilities, assets etc, pass them through
        maybeLocale.startsWith(".") ||
        maybeLocale === "auth" ||
        maybeLocale === "assets" ||
        maybeLocale === "favicon.ico" ||
        maybeLocale.startsWith("hum")
      ) {
        return url;
      }

      const isFirstSegmentIsLocale = isStringIsLocale(maybeLocale);
      //2. If pathname present, but first segment isn't a locale, add default locale at the beginning

      if (!isFirstSegmentIsLocale) {
        url.pathname = `/${i18n.defaultLocale}/${parts.join("/")}`;
        return url;
      }

      //3. If pathname is present and the first segment is locale

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

function isStringIsLocale(str: string): str is Locale {
  return i18n.locales.includes(str as Locale);
}
