import {
  useLoaderData,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { LucideX } from "lucide-react";

import { $saveHiddenAlertIds } from "@/serverFunctions/alert";

import { Button } from "./ui/button";

export function Alerts() {
  const { alerts } = useLoaderData({ from: "/{-$lang}/_layout/_main" });
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout/_main" });

  const router = useRouter();

  async function handleHideAlert(alertId: string) {
    await $saveHiddenAlertIds({ data: { alertId, locale: lang } });
    await router.invalidate({
      filter: (r) => r.fullPath !== "/{-$lang}/admin",
    });
  }

  if (!alerts || alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertMessage
          key={alert.id}
          {...alert}
          onHide={(alertId) => {
            handleHideAlert(alertId);
          }}
        />
      ))}
    </ul>
  );
}

export function AlertMessage({
  id,
  content,
  onHide,
}: {
  onHide?: (alertId: string) => void;
  id: string;
  content: string;
}) {
  return (
    <div className="border-secondary text-foreground-dark flex items-center justify-between gap-2 rounded-sm border bg-white px-4 py-2">
      <p className="text-xs whitespace-pre-wrap">{content}</p>
      <Button
        onClick={() => onHide?.(id)}
        variant={"ghost"}
        size={"icon"}
        aria-label="Hide alert"
      >
        <LucideX className="size-5" />
      </Button>
    </div>
  );
}
