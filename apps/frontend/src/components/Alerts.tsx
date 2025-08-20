import {
  $saveHiddenAlertIds,
  GetActiveAlertsResponse,
} from "@/serverFunctions/alert";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { LucideX } from "lucide-react";
import { Button } from "./ui/button";
import { useLocale } from "use-intl";

export function Alerts() {
  const { alerts } = useLoaderData({ from: "/_main" });
  const locale = useLocale();
  const router = useRouter();

  async function handleHideAlert(alertId: string) {
    await $saveHiddenAlertIds({ data: { alertId, locale } });
    await router.invalidate({ filter: (r) => r.fullPath !== "/admin" });
  }

  if (!alerts || alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertMessage key={alert.alertId} {...alert} onHide={handleHideAlert} />
      ))}
    </ul>
  );
}

export function AlertMessage({
  alertId,
  title,
  message,
  onHide,
}: Pick<GetActiveAlertsResponse[number], "alertId" | "title" | "message"> & {
  onHide?: (alertId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-yellow-600 bg-yellow-100 px-4 py-2 text-yellow-950">
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <Button
        onClick={() => onHide?.(alertId)}
        variant={"ghost"}
        size={"icon"}
        aria-label="Hide alert"
      >
        <LucideX className="size-5" />
      </Button>
    </div>
  );
}
