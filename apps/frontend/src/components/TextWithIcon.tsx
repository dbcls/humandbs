import { cn } from "@/lib/utils"

function TextWithIcon({ children, icon, className }: {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("inline-flex items-center gap-1", className)}>
    {icon}
    {children}
  </div>
}

export { TextWithIcon }
