import { useTranslations } from "use-intl";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export function FacetItemWrapper({
  id,
  hasValue,
  onReset,
  children,
  headerAction,
}: {
  id: string;
  hasValue: boolean;
  onReset: () => void;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  const tFilters = useTranslations("Filters");
  const t = useTranslations(`Filters.${id}` as any) as any;

  return (
    <AccordionItem
      value={id}
      className="relative border-b-primary-translucent data-[state=open]:pb-[4px]"
    >
      <AccordionTrigger className="py-2.5 font-bold text-secondary hover:no-underline">
        <span className="truncate pr-[80px]">{t("title" as any)}</span>
      </AccordionTrigger>

      <div className="pointer-events-none absolute top-0 right-7 z-10 flex h-[40px] items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-1">
          {headerAction}
          {hasValue && (
            <Button
              variant="tableAction"
              className="h-[21px] shrink-0 px-2 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              {tFilters("panel-reset")}
            </Button>
          )}
        </div>
      </div>

      <AccordionContent className="px-1 py-1">{children}</AccordionContent>
    </AccordionItem>
  );
}
