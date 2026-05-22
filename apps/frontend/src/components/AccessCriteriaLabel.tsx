import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { LockIcon, LockOpen } from "lucide-react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex items-center gap-1 text-nowrap rounded-sm px-2 py-1 [&_svg]:rounded-sm",
  {
    variants: {
      criteria: {
        "Unrestricted-access": "[&_svg]:text-secondary",
        "Controlled-access (Type I)": "[&_svg]:text-accent-light",
        "Controlled-access (Type II)": "[&_svg]:text-pink-600",
      },
      size: {
        md: "items-baseline p-0 text-base [&_svg]:size-7",
        sm: "text-sm [&_svg]:size-6",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

interface AccessCriteriaLabelProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof variants> {}

export function AccessCriteriaLabel({ criteria, className, size }: AccessCriteriaLabelProps) {
  const t = useTranslations("Dataset");

  const icon = criteria === "Unrestricted-access" ? <LockOpen /> : criteria ? <LockIcon /> : null;

  return (
    <span className={cn("", variants({ criteria, size }), className)}>
      {icon}
      {criteria && t(criteria)}
    </span>
  );
}
