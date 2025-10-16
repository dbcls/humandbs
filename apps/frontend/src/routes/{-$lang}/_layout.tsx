import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { CatchBoundary, createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  // const { messages, lang } = Route.useRouteContext();

  // const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    // <IntlProvider locale={lang} messages={messages} timeZone={timeZone}>
    // </IntlProvider>
    <CatchBoundary getResetKey={() => "reset"}>
      <Navbar />
      {/*<Alerts />*/}
      {/*<Breacrumbs breadcrumbsPath={crumbs} />*/}
      <Outlet />
      <Footer />
    </CatchBoundary>
  );
}
