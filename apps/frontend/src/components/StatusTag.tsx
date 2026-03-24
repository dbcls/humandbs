import { cva, type VariantProps } from "class-variance-authority";

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

// Research-specific statuses
const researchTagVariants = cva(
  "rounded-sm border capitalize inline-flex items-center font-medium transition-colors group-data-[active=true]:border-white group-data-[active=true]:text-white group-data-[active=true]:bg-transparent",
  {
    variants: {
      status: {
        draft:     "text-gray-500 border-gray-400 bg-gray-50",
        review:    "text-yellow-700 border-yellow-400 bg-yellow-50",
        published: "text-secondary border-secondary bg-blue-50",
        deleted:   "text-gray-400 border-gray-300 bg-gray-50",
      },
      size: {
        sm: "px-2 py-0 text-2xs",
        md: "px-3 py-0.5 text-sm",
      },
    },
    defaultVariants: {
      status: "draft",
      size: "sm",
    },
  }
);

type ResearchTagProps = {
  tag: string;
  size?: "sm" | "md";
  className?: string;
};

export function Tag({ tag, size = "sm", className }: ResearchTagProps) {
  const status = tag as "draft" | "review" | "published" | "deleted";
  return (
    <div className={cn(researchTagVariants({ status, size }), className)}>
      {tag}
    </div>
  );
}
