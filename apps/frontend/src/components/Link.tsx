import { Link as BaseLink, LinkComponentProps } from "@tanstack/react-router";
import { cva, VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const linkVariants = cva("text-secondary underline", {
  variants: {
    variant: {
      default: "inline-block",
      nav: "[&.active]:text-secondary text-foreground block w-fit font-medium no-underline",
      alert: "text-alert",
      button:
        "rounded-full bg-white border border-secondary text-secondary [&.active]:text-secondary px-5 py-2 no-underline",
    },
    size: {
      default: "text-sm",
      xs: "text-xs",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface LinkProps
  extends LinkComponentProps,
    VariantProps<typeof linkVariants> {}

export function Link({ className, variant, ...rest }: LinkProps) {
  return (
    <BaseLink {...rest} className={cn(linkVariants({ variant }), className)} />
  );
}
