import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Footer } from "@/components/Footer";
import { QueryClient } from "@tanstack/react-query";
import css from "@/index.css?url";
import { Navbar } from "@/components/Navbar";
import { getLocaleFn } from "@/serverFunctions/locale";
import { i18n, Locale } from "@/serverFunctions/i18n-config";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  crumb: string;
  lang: Locale | null;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "シン NBDCヒトデータベース" },
    ],

    links: [{ rel: "stylesheet", href: css }],
  }),
  component: RootComponent,
  beforeLoad: async (ctx) => {
    const locale = await getLocaleFn();

    const pathname = ctx.location.pathname;
    const pathnameIsMissingLocale = i18n.locales.every(
      (locale) =>
        !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    let lang = locale;

    if (pathnameIsMissingLocale) {
      // e.g. incoming request is /products
      // The new URL is now /en-US/products
      throw redirect({
        //@ts-expect-error
        to: `/${locale}${pathname}`,
      });
    } else {
      lang = pathname.split("/")[1] as Locale;
    }

    return {
      lang,
    };
  },
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
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
