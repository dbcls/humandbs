import { CatchBoundary, createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { IntlProvider } from "use-intl";

import { Navbar } from "@/components/Navbar";
import { i18n, localeSchema } from "@/config/i18n";
import { $getMessages } from "@/serverFunctions/i18n";
import { $getSiteNavigation } from "@/serverFunctions/siteNavigation";

// import { getMessagesFn } from "@/serverFunctions/locale";

const langSchemaWithDefault = localeSchema.default(i18n.defaultLocale);

export const Route = createFileRoute("/{-$lang}/_layout")({
  component: RouteComponent,
  beforeLoad: async ({ params, location }) => {
    const parseLang = langSchemaWithDefault.safeParse(params.lang);

    if (!parseLang.success) {
      const normalizedPath = location.pathname.replace(/^\/+/, "");

      throw redirect({
        to: "/{-$lang}/$",
        params: {
          _splat: normalizedPath,
          lang: i18n.defaultLocale,
        },
      });
    }

    const lang = parseLang.data;
    const messages = await $getMessages({
      data: lang,
    });
    const siteNavigation = await $getSiteNavigation({
      data: lang,
    });

    return {
      messages,
      lang,
      siteNavigation,
    };
  },
  loader: ({ context }) => {
    return {
      crumb: context.messages?.Navbar?.home,
      alerts: [],
    };
  },
});

function RouteComponent() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { messages, lang } = Route.useRouteContext();

  return (
    <IntlProvider
      getMessageFallback={({ key }) => {
        return key;
      }}
      onError={(error) => {
        console.warn(error);
      }}
      locale={lang}
      messages={messages}
      timeZone={timeZone}
    >
      <CatchBoundary getResetKey={() => "reset"}>
        <Navbar />
        <Outlet />
      </CatchBoundary>
    </IntlProvider>
  );
}
