import { localeSchema } from "@/lib/i18n-config";
import { resolveLang } from "@/lib/router-utils";
import {
  $getHiddenAlertIds,
  getActiveAlertsQueryOptions,
} from "@/serverFunctions/alert";
import { getMessagesFn } from "@/serverFunctions/locale";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { IntlProvider } from "use-intl";
import z from "zod";

export const Route = createFileRoute("/{-$lang}")({
  params: z.object({ lang: localeSchema.optional() }),
  beforeLoad: async ({ params }) => {
    console.log("route");

    const { lang, wasLocalePrefix } = resolveLang(params);

    console.log({ lang, wasLocalePrefix });

    // if no path lang, and supposed by the server lang is not default, switch to that supposed lang
    // i.e. `example.com/news`, but say, "en" in cookies -> `example.com/en/news`
    // if (context.lang !== i18n.defaultLocale) {
    //   console.log("redirecting");
    //   throw redirect({ to: ".", params: { lang: context.lang } });
    // }
    // if (!!params.lang && !i18n.locales.includes(params.lang as Locale)) {
    //   throw redirect({
    //     to: "/{-$lang}/$",
    //     params: { lang: undefined, _splat: params.lang },
    //   });
    // }

    const messages = await getMessagesFn({ data: lang });
    //
    return {
      messages,
      lang,
      wasLocalePrefix,
    };
  },
  loader: async ({ context }) => {
    console.log("loader lang", context.lang);
    const activeAlertTranslations = await context.queryClient.ensureQueryData(
      getActiveAlertsQueryOptions({ locale: context.lang })
    );

    const hiddenAlerts = await $getHiddenAlertIds();

    return {
      crumb: context.messages.Navbar.home,
      alerts: activeAlertTranslations.filter(
        (alert) => !hiddenAlerts.includes(alert.newsId)
      ),
    };
  },
  component: () => {
    const { messages, lang } = Route.useRouteContext();

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
      <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
        <Outlet />
      </IntlProvider>
    );
  },
});

// beforeLoad: ({ params }) => {
//   // if there some prefix that is not a lang, redirect to splat route.
//   if (!!params.lang && !i18n.locales.includes(params.lang as Locale)) {
//     throw redirect({
//       to: ".",
//       params: { lang: undefined, _splat: params.lang },
//     });
//   }
// },
//
//
