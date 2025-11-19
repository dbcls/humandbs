import { CardWithCaption } from "@/components/Card";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { CartItem, useCart } from "@/hooks/useCart";
import { FA_ICONS } from "@/lib/faIcons";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  loader: () => ({ crumb: "Cart" }),
});

function RouteComponent() {
  const { cart, remove } = useCart();

  return (
    <CardWithCaption size={"sm"}>
      <ul>
        {cart.map((item) => (
          <li key={item.datasetId}>
            <span className="flex items-start justify-between">
              <TextWithIcon
                key={`${item.datasetId}-${item.version}`}
                icon={FA_ICONS.dataset}
              >
                {item.datasetId}-{item.version}
              </TextWithIcon>
              <Button variant={"plain"} onClick={() => remove(item)}>
                <Trash2 className="text-danger size-5" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}
