import ConfirmationDialog from "@/components/ConfirmationDialog";
import { SessionRefreshHandler } from "@/components/SessionRefreshHandler";
import css from "@/index.css?url";
import { Context } from "@/router";
import { $getAuthUser } from "@/serverFunctions/user";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

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

  beforeLoad: async () => {
    const { user, session } = await $getAuthUser();

    return {
      user,
      session,
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
  const { lang, session } = Route.useRouteContext();

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="font-family-sans text-foreground main-bg relative">
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <SessionRefreshHandler session={session} />
        <ConfirmationDialog />
        <Scripts />
      </body>
    </html>
  );
}
