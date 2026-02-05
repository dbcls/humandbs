import { cva, VariantProps } from "class-variance-authority";

import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { cn } from "@/lib/utils";

const statusTagVariants = cva(
  "rounded-sm px-2 py-0 text-2xs border capitalize inline-block transition-colors",
  {
    variants: {
      status: {
        [DOCUMENT_VERSION_STATUS.DRAFT]:
          "text-foreground-light border-foreground-light",
        [DOCUMENT_VERSION_STATUS.PUBLISHED]:
          "text-accent-light border-accent-light",
        current: "text-secondary-light border-secondary-light",
        archived: "text-yellow-600 border-yellow-600",
      },
    },
    defaultVariants: {
      status: DOCUMENT_VERSION_STATUS.DRAFT,
    },
  }
);

interface StatusProps
  extends VariantProps<typeof statusTagVariants>,
    React.HTMLProps<HTMLDivElement> {}

export function StatusTag({ className, ...props }: StatusProps) {
  return (
    <div
      className={cn(
        statusTagVariants({ status: props.status }),
        "group-data-[active=true]:border-white group-data-[active=true]:text-white",
        className
      )}
      {...props}
    >
      {props.status}
    </div>
  );
}

export function Tag({ tag, className }: { tag: string; className?: string }) {
  return (
    <div
      className={cn(
        statusTagVariants({ status: "current" }),
        "w-10 text-center",
        "group-data-[active=true]:border-white group-data-[active=true]:text-white",
        className
      )}
    >
      {tag}
    </div>
  );
}
