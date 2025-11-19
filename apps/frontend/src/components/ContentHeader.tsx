import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";

const contentHeaderVariants = cva("text-secondary font-semibold", {
  variants: {
    variant: {
      default: "mb-6 text-3xl",
      sm: "mb-3 text-2xl",
      block:
        "bg-linear-to-r from-secondary-light to-secondary-lighter text-white rounded-sm py-2 px-3 mb-4",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type ContentHeaderProps = {
  children: React.ReactNode;
} & VariantProps<typeof contentHeaderVariants>;

export function ContentHeader({ children, variant }: ContentHeaderProps) {
  return (
    <h2 className={cn("", contentHeaderVariants({ variant }))}>{children}</h2>
  );
}
