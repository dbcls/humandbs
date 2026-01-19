import { useLoaderData, useRouter } from "@tanstack/react-router";
import { LucideX } from "lucide-react";
import { useLocale } from "use-intl";

import {
  $saveHiddenAlertIds,
  ActiveAlertsItemResponse,
} from "@/serverFunctions/alert";

import { Link } from "./Link";
import { Button } from "./ui/button";

export function Alerts() {
  const { alerts } = useLoaderData({ from: "/{-$lang}/_layout/_main" });
  const locale = useLocale();
  const router = useRouter();

  async function handleHideAlert(newsId: string) {
    await $saveHiddenAlertIds({ data: { newsId, locale } });
    await router.invalidate({
      filter: (r) => r.fullPath !== "/{-$lang}/admin",
    });
  }

  if (!alerts || alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertMessage key={alert.newsId} {...alert} onHide={handleHideAlert} />
      ))}
    </ul>
  );
}

export function AlertMessage({
  newsId,
  title,
  onHide,
}: ActiveAlertsItemResponse & {
  onHide?: (alertId: string) => void;
}) {
  const locale = useLocale();
  return (
    <div className="border-secondary text-foreground-dark flex items-center justify-between gap-2 rounded-sm border bg-white px-4 py-2">
      <div>
        <Link
          variant={"alert"}
          to="/{-$lang}/news/$newsItemId"
          params={{
            lang: locale,
            newsItemId: newsId,
          }}
        >
          {title}
        </Link>
      </div>
      <Button
        onClick={() => onHide?.(newsId)}
        variant={"ghost"}
        size={"icon"}
        aria-label="Hide alert"
      >
        <LucideX className="size-5" />
      </Button>
    </div>
  );
}
