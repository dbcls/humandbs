import { Slot } from "@radix-ui/react-slot";
import { cva, VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  " cursor-pointer whitespace-nowrap rounded font-semibold text-white",
  {
    variants: {
      size: {
        lg: "px-8 py-4 text-sm",
        default: "px-4 py-2 text-xs",
        slim: "p-1 text-xs",
        icon: "p-2 text-sm",
      },
      variant: {
        accent:
          "disabled:opacity-30 bg-linear-to-r from-accent to-accent-light hover:from-accent/80 hover:saturate-150 active:bg-accent/90",
        action: " bg-linear-to-r from-secondary to-secondary-light",
        outline:
          "border border-tetriary bg-transparent text-black hover:bg-white/50",
        tableAction: "bg-secondary-light rounded-full ",
        plain: " bg-none",
        "cms-table-action":
          "bg-none rounded-xs hover:bg-hover active:bg-foreground-light/30",
        toggle:
          " bg-none text-foreground rounded-md whitespace-normal w-full text-left hover:bg-hover",
        ghost: "bg-none text-black",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "accent",
    },
  }
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
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
