import {
  CatchBoundary,
  createFileRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { i18n, localeSchema } from "@/config/i18n-config";
import { getMessagesFn } from "@/serverFunctions/locale";
import { IntlProvider } from "use-intl";
import z from "zod";

const langSchemaWithDefault = localeSchema.default(i18n.defaultLocale);

export const Route = createFileRoute("/{-$lang}/_layout")({
  component: RouteComponent,
  //params: z.object({ lang: langSchemaWithDefault }),
  beforeLoad: async ({ params }) => {
    const parseLang = langSchemaWithDefault.safeParse(params.lang);

    // console.log("parseLang", parseLang.data);

    // /hello/world -> /ja/hello/world with $ = "hello/world"
    //
    if (!parseLang.success) {
      throw redirect({
        to: "/{-$lang}/$",
        params: { _splat: location.pathname, lang: undefined },
      });
    }

    const lang = parseLang.data || i18n.defaultLocale;

    const messages = await getMessagesFn({
      data: lang,
    });

    return {
      messages,
      lang,
    };
  },
  loader: async ({ context }) => {
    return {
      crumb: context.messages.Navbar.home,
      alerts: [],
    };
  },
});

function RouteComponent() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { messages, lang } = Route.useRouteContext();

  return (
    <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
      <CatchBoundary getResetKey={() => "reset"}>
        {/*<Navbar />*/}
        <Outlet />
        {/*<Footer />*/}
      </CatchBoundary>
    </IntlProvider>
  );
}

// import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
// import { IntlProvider } from "use-intl";

// export const Route = createFileRoute("/{-$lang}")({
//   beforeLoad: async ({ params, location }) => {
//     const parseLang = langSchemaWithDefault.safeParse(params.lang);

//     // console.log("parseLang", parseLang.data);

//     // if (!parseLang.success) {
//     //   throw redirect({
//     //     to: `/{-$lang}/$`,
//     //     params: { _splat: location.pathname, lang: i18n.defaultLocale },
//     //   });
//     // }

//     const lang = parseLang.data;

//     const messages = await getMessagesFn({ data: lang });

//     return {
//       messages,
//       lang,
//     };
//   },
//   loader: async ({ context }) => {
//     return {
//       crumb: context.messages.Navbar.home,
//       alerts: [],
//     };
//   },
//   component: () => {
//     const { messages, lang } = Route.useRouteContext();

//     const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

//     return (
//       <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
//         <Outlet />
//       </IntlProvider>
//     );
//   },
// });
