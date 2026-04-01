import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  " cursor-pointer whitespace-nowrap flex text-foreground items-center rounded font-semibold disabled:opacity-30 disabled:cursor-default",
  {
    variants: {
      size: {
        lg: "px-8 py-4 text-sm",
        tableAction: "px-8 py-3 text-sm",
        default: "px-4 py-2 text-xs",
        slim: "p-1 text-xs",
        icon: "p-2 text-sm",
      },
      variant: {
        accent:
          "bg-linear-to-r  text-white  from-accent to-accent-light enabled:hover:from-accent/80 enabled:hover:saturate-150 active:bg-accent/90",
        action: " bg-linear-to-r text-white  from-secondary to-secondary-light",
        outline:
          "border border-tetriary bg-transparent enabled:hover:bg-white/50",
        tableAction: "bg-secondary-light  text-white  rounded-full ",
        plain: "bg-none",
        "cms-table-action":
          "bg-none rounded-xs enabled:hover:bg-hover active:bg-foreground-light/30",
        dashed:
          "w-full rounded border border-dashed text-sm text-gray-500 hover:bg-gray-50",
        toggle:
          " bg-none rounded-md whitespace-normal w-full text-left enabled:hover:bg-hover",
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
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
