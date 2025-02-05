
import { cva, VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(" whitespace-nowrap rounded font-semibold text-white", {
  variants: {
    size: {
      lg: "px-8 py-4 text-sm",
    },
    variant: {
      accent: " bg-linear-to-r from-accent to-accent-light",
      action: " bg-linear-to-r from-secondary to-secondary-light",
    },
  },
  defaultVariants: {
    size: "lg",
    variant: "accent",
  },
})

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { }

export function Button({ children, size, variant, ...rest }: ButtonProps) {

  return (
    <button className={cn(buttonVariants({ variant, size }))} {...rest}>
      {children}
    </button>
  )

}
