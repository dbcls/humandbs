import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import type { ResearchStatus } from "@humandbs/backend/types";

import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { cn } from "@/lib/utils";

const statusTagVariants = cva(
  "inline-block rounded-sm border px-2 py-0 text-2xs capitalize transition-colors",
  {
    variants: {
      status: {
        [DOCUMENT_VERSION_STATUS.DRAFT]: "border-foreground-light text-foreground-light",
        [DOCUMENT_VERSION_STATUS.PUBLISHED]: "border-accent-light text-accent-light",
        current: "border-secondary-light text-secondary-light",
        archived: "border-yellow-600 text-yellow-600",
        review: "border-yellow-700 text-yellow-700",
        deleted: "border-gray-300 text-gray-400",
      },
    },
    defaultVariants: {
      status: DOCUMENT_VERSION_STATUS.DRAFT,
    },
  },
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
        className,
      )}
      {...props}
    >
      {props.status}
    </div>
  );
}

// Research-specific statuses
const researchTagVariants = cva(
  "inline-flex items-center rounded-sm border font-medium capitalize transition-colors group-data-[active=true]:border-white group-data-[active=true]:bg-transparent group-data-[active=true]:text-white",
  {
    variants: {
      status: {
        draft: "border-gray-400 bg-gray-50 text-gray-500",
        review: "border-yellow-400 bg-yellow-50 text-yellow-700",
        published: "border-secondary bg-blue-50 text-secondary",
        deleted: "border-gray-300 bg-gray-50 text-gray-400",
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
  },
);

type ResearchTagProps = {
  tag: ResearchStatus;
  size?: "sm" | "md";
  className?: string;
};

export function Tag({ tag, size = "sm", className }: ResearchTagProps) {
  return <div className={cn(researchTagVariants({ status: tag, size }), className)}>{tag}</div>;
}
