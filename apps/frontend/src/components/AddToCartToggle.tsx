import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { ShoppingCartIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

const addToCartVariants = cva("hover:text-white flex items-center gap-2", {
  variants: {
    variant: {
      row: "text-foreground-light  hover:text-white hover:bg-secondary-light/40 data-[state=indeterminate]:hover:bg-secondary-light/80 data-[state=true]:bg-secondary-light data-[state=true]:text-white data-[state=indeterminate]:bg-secondary-light/50 data-[state=indeterminate]:text-white/50",
      header:
        "text-white bg-none　hover:bg-white/30  data-[state=true]:bg-white data-[state=true]:text-secondary data-[state=indeterminate]:bg-white/50 data-[state=indeterminate]:text-secondary/50",
    },
  },
  defaultVariants: {
    variant: "row",
  },
});

interface AddToCartToggleProps
  extends
    Omit<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size">,
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
