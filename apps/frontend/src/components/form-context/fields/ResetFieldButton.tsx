import { RotateCcw } from "lucide-react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ResetFieldButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const tMarkdown = useTranslations("admin.markdown");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-type="reset"
      onClick={onClick}
      className={cn(
        "absolute right-0 text-form-icon-btn hover:text-form-icon-btn-hover",
        className,
      )}
      title={tMarkdown("reset-field")}
    >
      <RotateCcw className="size-4" />
    </Button>
  );
}
