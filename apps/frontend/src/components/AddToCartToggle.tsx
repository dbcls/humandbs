import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { ShoppingCartIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./ui/button";

const addToCartVariants = cva("flex items-center gap-2 hover:text-white", {
  variants: {
    variant: {
      row: "text-foreground-light hover:bg-secondary-light/40 hover:text-white data-[state=indeterminate]:bg-secondary-light/50 data-[state=true]:bg-secondary-light data-[state=indeterminate]:text-white/50 data-[state=true]:text-white data-[state=indeterminate]:hover:bg-secondary-light/80",
      header:
        "bg-none text-white hover:bg-white/30 data-[state=indeterminate]:bg-white/50 data-[state=true]:bg-white data-[state=indeterminate]:text-secondary/50 data-[state=true]:text-secondary",
    },
  },
  defaultVariants: {
    variant: "row",
  },
});

interface AddToCartToggleProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size">,
    VariantProps<typeof addToCartVariants> {
  state: boolean | "indeterminate";
}

export function AddToCartToggle({
  state,
  variant,
  className,
  children,
  ...rest
}: AddToCartToggleProps) {
  return (
    <Button
      {...rest}
      data-state={state}
      variant={"plain"}
      size={"icon"}
      className={cn(addToCartVariants({ variant }), className)}
    >
      <ShoppingCartIcon className="size-5" />
      {children}
    </Button>
  );
}
