import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Footer } from "@/components/Footer";
import { QueryClient } from "@tanstack/react-query";
import css from "@/index.css?url";
import { Navbar } from "@/components/Navbar";
import { useTranslation } from "react-i18next";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
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
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const [t, i18n] = useTranslation();

  console.log(i18n.languages);

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
