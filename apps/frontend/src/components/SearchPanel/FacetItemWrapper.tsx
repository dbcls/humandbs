import { useTranslations } from "use-intl";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
    <AccordionItem value={id} className="border-b-primary-translucent data-[state=open]:pb-[4px] relative">
      <AccordionTrigger className="text-secondary font-bold py-2.5 hover:no-underline">
        <span className="truncate pr-[80px]">{t("title" as any)}</span>
      </AccordionTrigger>
        
      <div className="absolute right-7 top-0 bottom-0 flex items-center gap-1 z-10 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1">
          {headerAction}
          {hasValue && (
            <Button
              variant="tableAction"
              className="h-[21px] px-2 text-[10px] shrink-0"
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
      
      <AccordionContent className="py-1 px-1">{children}</AccordionContent>
    </AccordionItem>
  );
}
