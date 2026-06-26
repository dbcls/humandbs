import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const contentHeaderVariants = cva("font-semibold text-secondary", {
  variants: {
    variant: {
      default: "mt-10 mb-2 text-3xl",
      sm: "mb-3 text-2xl",
      block:
        "mb-4 rounded-sm bg-linear-to-r from-secondary-light to-secondary-lighter px-3 py-2 text-white",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type ContentHeaderProps = {
  children: React.ReactNode;
  className?: string;
} & VariantProps<typeof contentHeaderVariants>;

export function ContentHeader({ children, variant, className }: ContentHeaderProps) {
  return <h2 className={cn("", contentHeaderVariants({ variant }), className)}>{children}</h2>;
}
