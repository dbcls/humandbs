import ConfirmationDialog from "@/components/ConfirmationDialog";
import css from "@/index.css?url";
import { auth } from "@/lib/auth";
import { Context } from "@/router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const getUser = createServerFn({ method: "GET" }).handler(async () => {
  const { headers } = getRequest();
  try {
    const session = await auth.api.getSession({ headers });
    return session?.user || null;
  } catch (error) {
    return null;
  }
});

export const Route = createRootRouteWithContext<Context>()({
  head: () => {
    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        { title: `シン NBDCヒトデータベース` },
        { rel: "icon", href: "/favicon.ico" },
      ],

      links: [{ rel: "stylesheet", href: css }],
    };
  },
  component: RootComponent,

  beforeLoad: async ({ matches }) => {
    console.log(
      "matches",
      matches.map((m) => m.fullPath)
    );

    // const locale = await getLocaleFn();

    // console.log("locale detected:", locale);

    // console.log("");
    const user = await getUser();

    // // await saveLocaleFn({ data: { lang: locale } });

    // const messages = await getMessagesFn({ data: locale });

    return {
      // lang: locale,
      // messages,
      user,
    };
  },
});

function RootComponent() {
  // const { messages, lang } = Route.useRouteContext();

  // const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    // <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
    <RootDocument>
      <Outlet />
    </RootDocument>
    // </IntlProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { lang } = Route.useRouteContext();

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="font-family-sans text-foreground main-bg relative">
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <ConfirmationDialog />
        <Scripts />
      </body>
    </html>
  );
}
