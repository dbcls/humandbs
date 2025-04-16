
import { Slot } from "@radix-ui/react-slot"
import { cva, VariantProps } from "class-variance-authority"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(" cursor-pointer whitespace-nowrap rounded font-semibold text-white", {
  variants: {
    size: {
      lg: "px-8 py-4 text-sm",
      default: "px-4 py-2 text-xs",
      slim: "p-1 text-xs",
    },
    variant: {
      accent: " bg-linear-to-r from-accent to-accent-light",
      action: " bg-linear-to-r from-secondary to-secondary-light",
      tableAction: " bg-secondary-light rounded-full ",
      plain: " bg-none",
    },
  },
  defaultVariants: {
    size: "default",
    variant: "accent",
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button }
