import { cn } from "@/lib/utils";
import { Link as BaseLink, LinkComponentProps } from "@tanstack/react-router";
import { cva, VariantProps } from "class-variance-authority";

const linkVariants = cva("text-secondary underline", {
  variants: {
    variant: {
      default: "inline-block",
      nav: "[&.active]:text-secondary text-foreground block w-fit font-medium no-underline",
    },
    size: {
      default: "text-sm",
      xs: "text-xs",
    },
  },
  defaultVariants: {
    variant: "default",
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
