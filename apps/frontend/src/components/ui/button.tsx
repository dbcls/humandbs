import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "flex cursor-pointer items-center whitespace-nowrap rounded font-semibold text-foreground transition-colors disabled:cursor-default disabled:opacity-30",
  {
    variants: {
      size: {
        lg: "px-8 py-4 text-sm",
        xl: "px-10 py-5 text-base",
        tableAction: "h-11 px-5 text-xs",
        default: "px-4 py-2 text-xs",
        slim: "p-1 text-xs",
        icon: "p-2 text-sm",
      },
      variant: {
        accent:
          "bg-linear-to-r from-accent to-accent-light text-white transition-[filter] hover:from-accent/80 hover:saturate-150 active:saturate-100",
        action:
          "bg-linear-to-r from-secondary to-secondary-light text-white transition-[filter] hover:saturate-150 active:saturate-100",
        outline: "border border-tetriary bg-transparent enabled:hover:bg-white/50",
        tableAction:
          "rounded-full border border-secondary-light bg-white text-secondary-light transition-colors hover:bg-hover hover:text-secondary",
        plain: "bg-none",
        "cms-table-action":
          "rounded-xs bg-none active:bg-foreground-light/30 enabled:hover:bg-hover",
        dashed: "w-full rounded border border-dashed text-gray-500 text-sm hover:bg-gray-50",
        toggle: "w-full whitespace-normal rounded-md bg-none text-left enabled:hover:bg-hover",
        ghost: "bg-none",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "accent",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button };
