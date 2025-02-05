import { ReactNode } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

export function Card({ children, className, caption }: { children: React.ReactNode, className?: string, caption?: ReactNode }) {
  return (
    <div className={cn("rounded-md bg-white p-4 h-fit", className)}>
      {caption ? <h2 className="text-secondary before:bg-secondary relative font-medium before:absolute before:-left-4 before:h-full before:w-1 before:rounded-r-sm">{caption}</h2> : null}
      {children}
    </div>
  )

}
