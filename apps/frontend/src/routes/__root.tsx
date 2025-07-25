import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import css from "@/index.css?url";
import { auth } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { i18n as i18nConfig } from "@/lib/i18n-config";
import { Context } from "@/router";
import {
  getLocaleFn,
  getMessagesFn,
  saveLocaleFn,
} from "@/serverFunctions/locale";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { IntlProvider } from "use-intl";

const getUser = createServerFn({ method: "GET" }).handler(async () => {
  const { headers } = getWebRequest()!;
  try {
    const session = await auth.api.getSession({ headers });
    return session?.user || null;
  } catch (error) {
    return null;
  }
});

export const Route = createRootRouteWithContext<Context>()({
  head: ({
    match: {
      context: { lang },
    },
  }) => {
    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        { title: `シン NBDCヒトデータベース ${lang}` },
        { rel: "icon", href: "/favicon.ico" },
      ],

      links: [{ rel: "stylesheet", href: css }],
    };
  },
  component: RootComponent,
  beforeLoad: async (ctx) => {
    const locale = await getLocaleFn();
    const user = await getUser();

    // if in request path missing locale, add it
    const pathname = ctx.location.pathname;
    const pathnameIsMissingLocale = i18nConfig.locales.every(
      (locale) =>
        !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    await saveLocaleFn({ data: { lang: locale } });

    if (pathnameIsMissingLocale && !pathname.startsWith("/admin")) {
      throw redirect({
        //@ts-expect-error
        to: `/${locale}${pathname}`,
      });
    }

    const messages = await getMessagesFn({ data: locale });

    return {
      lang: locale,
      messages,
      user,
    };
  },
});

function RootComponent() {
  const { messages, lang } = Route.useRouteContext();

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </IntlProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body className="font-family-sans text-foreground main-bg relative">
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
