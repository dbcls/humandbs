import { cva, VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  caption?: ReactNode;
}

function Card({ children, className, caption }: CardProps) {
  return (
    <div className={cn("h-fit rounded-md bg-white p-4", className)}>
      {caption ? (
        <div className="text-secondary before:bg-secondary relative font-medium before:absolute before:-left-4 before:h-full before:w-1 before:rounded-r-sm">
          {caption}
        </div>
      ) : null}
      {children}
    </div>
  );
}

const cardWithColorCaptionVariants = cva(
  " bg-linear-to-r rounded-t-md text-white",
  {
    variants: {
      variant: {
        light: " from-secondary to-secondary-light",
        dark: " from-tetriary to-tetriary-light ",
      },
      size: {
        sm: "p-2",
        lg: " px-3 pb-2 pt-5",
      },
    },
    defaultVariants: {
      size: "sm",
      variant: "light",
    },
  }
);

const contentVariants = cva("text-inherit", {
  variants: {
    size: {
      lg: "p-4",
      sm: "p-2",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface CardWithCaptionProps
  extends CardProps,
    VariantProps<typeof cardWithColorCaptionVariants> {}

function CardWithCaption({
  children,
  className,
  caption,
  size,
  variant,
  ...rest
}: CardWithCaptionProps) {
  return (
    <div className={cn("h-fit rounded-md bg-white", className)} {...rest}>
      {caption ? (
        <div className={cn(cardWithColorCaptionVariants({ size, variant }))}>
          {caption}
        </div>
      ) : null}
      <div className={cn(contentVariants({ size }))}>{children}</div>
    </div>
  );
}

export { CardWithCaption, Card };
