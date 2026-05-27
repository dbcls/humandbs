import type { LinkComponentProps } from "@tanstack/react-router";
import { Link as BaseLink } from "@tanstack/react-router";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const linkVariants = cva("text-secondary underline", {
  variants: {
    variant: {
      default: "inline-block visited:text-visited",
      nav: "block w-fit text-foreground no-underline [&.active]:text-secondary",
      alert: "text-alert",
      button:
        "rounded-full border border-secondary bg-white px-5 py-2 text-secondary no-underline [&.active]:text-secondary",
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

export interface LinkProps extends LinkComponentProps, VariantProps<typeof linkVariants> {}

export function Link({ className, variant, ...rest }: LinkProps) {
  return <BaseLink {...rest} className={cn(linkVariants({ variant }), className)} />;
}
