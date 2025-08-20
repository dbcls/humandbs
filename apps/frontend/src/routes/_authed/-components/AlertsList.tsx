import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getAlertsQueryOptions,
  GetAlertsResponse,
  $toggleAlertStatus,
  $deleteAlert,
} from "@/serverFunctions/alert";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import useConfirmationStore from "@/stores/confirmationStore";
import { Card } from "@/components/Card";

interface AlertsListProps {
  onClickAdd: () => void;
  selectedAlert?: GetAlertsResponse[number];
  onSelectAlert: (alert: GetAlertsResponse[number]) => void;
}

export function AlertsList({
  onClickAdd,
  selectedAlert,
  onSelectAlert,
}: AlertsListProps) {
  const queryClient = useQueryClient();
  const { data: alerts } = useSuspenseQuery(
    getAlertsQueryOptions({ limit: 100 })
  );
  const { openConfirmation } = useConfirmationStore();

  const { mutate: toggleStatus } = useMutation({
    mutationFn: ({
      alertId,
      isActive,
    }: {
      alertId: string;
      isActive: boolean;
    }) => $toggleAlertStatus({ data: { alertId, isActive } }),
    onSuccess: () => {
      queryClient.invalidateQueries(getAlertsQueryOptions({ limit: 100 }));
    },
  });

  const { mutate: deleteAlert } = useMutation({
    mutationFn: ({ alertId }: { alertId: string }) =>
      $deleteAlert({ data: { alertId } }),
    onSuccess: () => {
      queryClient.invalidateQueries(getAlertsQueryOptions({ limit: 100 }));
    },
  });

  function handleClickDeleteAlert(alertId: string) {
    openConfirmation({
      title: "Delete Alert",
      description: "Are you sure you want to delete this alert?",
      actionLabel: "Delete",
      onAction: () => deleteAlert({ alertId }),
    });
  }

  return (
    <Card
      className="flex h-full w-96 flex-col"
      captionSize={"sm"}
      caption="Alerts"
    >
      <ul>
        <li className="mb-5">
          <Button variant={"accent"} className="w-full" onClick={onClickAdd}>
            Add new
          </Button>
        </li>
        {alerts.map((alert) => {
          const isActive = selectedAlert?.id === alert.id;

          return (
            <ListItem
              key={alert.id}
              onClick={() => onSelectAlert(alert)}
              isActive={isActive}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant={alert.isActive ? "default" : "secondary"}>
                    {alert.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {alert.translations.map((tr) => (
                    <div
                      key={tr.locale}
                      className="flex items-center gap-1 truncate text-sm"
                    >
                      <span className="border-foreground inline-block w-10 rounded-sm border px-1 py-0 text-center text-sm">
                        {tr.locale}
                      </span>
                      <span>{tr.title}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="slim"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus({
                      alertId: alert.id,
                      isActive: !alert.isActive,
                    });
                  }}
                >
                  {alert.isActive ? (
                    <EyeOff
                      className={cn("h-4 w-4 transition-colors", {
                        "text-white": isActive,
                      })}
                    />
                  ) : (
                    <Eye
                      className={cn("h-4 w-4 transition-colors", {
                        "text-white": isActive,
                      })}
                    />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="slim"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClickDeleteAlert(alert.id);
                  }}
                >
                  <Trash2
                    className={cn("text-danger h-4 w-4 transition-colors", {
                      "text-white": isActive,
                    })}
                  />
                </Button>
              </div>
            </ListItem>
          );
        })}

        {alerts.length === 0 && (
          <li className="text-muted-foreground py-8 text-center text-sm">
            No alerts created yet.
          </li>
        )}
      </ul>
    </Card>
  );
}
