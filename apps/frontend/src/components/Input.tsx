import * as React from "react"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  beforeIcon?: React.ReactNode
  afterIcon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, beforeIcon, afterIcon, ...props }, ref) => {
    return (
      <div role="textbox" className=" bg-primary flex h-9 items-center gap-1 rounded-full p-1 text-base transition-colors focus-visible:ring-1">
        {beforeIcon ? (
          <div className="pointer-events-none flex items-center pl-1">
            {beforeIcon}
          </div>
        ) : null}
        {afterIcon ? (
          <div className="pointer-events-none flex items-center pr-1">
            {afterIcon}
          </div>
        ) : null}
        <input
          type={type}
          className={cn(
            "block file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none  disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          ref={ref}
          {...props}
        />
      </div>
    )
  },
)
Input.displayName = "Input"

export { Input }
