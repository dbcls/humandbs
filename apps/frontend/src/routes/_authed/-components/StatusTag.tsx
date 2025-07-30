import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";

const statusTagVariants = cva(
  "rounded-sm px-2 py-0 text-2xs border capitalize inline-block transition-colors",
  {
    variants: {
      status: {
        draft: "text-foreground-light border-foreground-light",
        published: "text-accent-light border-accent-light",
        current: "text-secondary-light border-secondary-light",
        archived: "text-yellow-600 border-yellow-600",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  }
);

interface StatusProps
  extends VariantProps<typeof statusTagVariants>,
    React.HTMLProps<HTMLDivElement> {
  isActive?: boolean;
}

export function StatusTag({ className, isActive, ...props }: StatusProps) {
  return (
    <div
      className={cn(statusTagVariants({ status: props.status }), className, {
        "border-white text-white": isActive,
      })}
      {...props}
    >
      {props.status}
    </div>
  );
}
