import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import css from "@/index.css?url";
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
import { IntlProvider } from "use-intl";

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
      ],

      links: [{ rel: "stylesheet", href: css }],
    };
  },
  component: RootComponent,
  beforeLoad: async (ctx) => {
    const locale = await getLocaleFn();

    // if in request path missing locale, add it
    const pathname = ctx.location.pathname;
    const pathnameIsMissingLocale = i18nConfig.locales.every(
      (locale) =>
        !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    await saveLocaleFn({ data: { lang: locale } });

    if (pathnameIsMissingLocale) {
      throw redirect({
        //@ts-expect-error
        to: `/${locale}${pathname}`,
      });
    }

    const messages = await getMessagesFn({ data: locale });

    return {
      lang: locale,
      messages,
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
        <main className="flex flex-col gap-2 p-4">
          <Navbar />
          {children}
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
          <Footer />
          <Scripts />
        </main>
      </body>
    </html>
  );
}
