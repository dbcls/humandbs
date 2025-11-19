import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";

const separatorVariants = cva("border-foreground-light my-4 h-px", {
  variants: {
    variant: {
      dashed: "border-dashed",
      solid: "border-solid",
    },
    extend: {
      none: "mx-0",
      lg: "-mx-7",
      sm: "-mx-3",
    },
  },
  defaultVariants: {
    variant: "dashed",
  },
});

type SeparatorProps = { className?: string; show?: boolean } & VariantProps<
  typeof separatorVariants
>;

export function Separator({
  className,
  variant,
  show,
  extend,
}: SeparatorProps) {
  if (!show) return null;
  return (
    <hr className={cn(separatorVariants({ variant, extend }), className)} />
  );
}
