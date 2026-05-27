import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const variants = cva("animate-spin", {
  variants: {
    variant: {
      secondary: "text-secondary",
      outline: "text-black",
    },
    size: {
      sm: "size-4",
      md: "size-6",
      lg: "size-8",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

interface LoadingSpinnerProps
  extends React.ComponentPropsWithoutRef<"svg">,
    VariantProps<typeof variants> {}

export function LoadingSpinner({ className, variant, size }: LoadingSpinnerProps) {
  return <LoaderCircle className={cn(variants({ variant, size }), className)} />;
}
