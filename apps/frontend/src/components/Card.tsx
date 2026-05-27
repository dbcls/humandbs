import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardCaptionVariants> {
  caption?: ReactNode;
  captionClassName?: string;
  containerClassName?: string;
  hideCaptionBorder?: boolean;
}

const cardCaptionVariants = cva("relative font-bold text-secondary", {
  variants: {
    captionSize: {
      lg: "text-lg",
      sm: "text-sm",
      default: "text-base",
    },
    hideCaptionBorder: {
      false: "pl-3 before:absolute before:-left-6 before:h-full before:w-2 before:bg-secondary",
      true: "",
    },
  },
  defaultVariants: {
    captionSize: "default",
    hideCaptionBorder: false,
  },
});

function Card({
  children,
  className,
  containerClassName,
  caption,
  captionClassName,
  captionSize = "default",
  hideCaptionBorder = false,
  ...rest
}: CardProps) {
  return (
    <div className={cn("h-fit rounded-md bg-white p-6", className)} {...rest}>
      {caption ? (
        <div
          id="caption"
          className={cn(cardCaptionVariants({ captionSize, hideCaptionBorder }), captionClassName)}
        >
          {typeof caption === "string" ? <h3>{caption}</h3> : caption}
        </div>
      ) : null}
      <div
        className={cn(
          "relative min-h-0",
          {
            "mt-3": !!caption && captionSize === "sm",
            "mt-10": !!caption && captionSize === "lg",
            "mt-4": !!caption && captionSize === "default",
          },
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

const cardWithColorCaptionVariants = cva("rounded-t-md bg-linear-to-r text-white", {
  variants: {
    variant: {
      light: "from-secondary to-secondary-light",
      dark: "from-tetriary to-tetriary-light",
    },
    size: {
      sm: "p-2",
      lg: "px-7 pt-5 pb-4",
    },
  },
  defaultVariants: {
    size: "sm",
    variant: "light",
  },
});

const contentVariants = cva("flex flex-col text-inherit", {
  variants: {
    size: {
      lg: "gap-5 p-7",
      sm: "gap-3 p-3",
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
  containerClassName,
  captionClassName,
  ...rest
}: CardWithCaptionProps) {
  return (
    <div className={cn("h-fit rounded-md bg-white", className)} {...rest}>
      {caption ? (
        <div className={cn(cardWithColorCaptionVariants({ size, variant }), captionClassName)}>
          {caption}
        </div>
      ) : null}
      <div className={cn(contentVariants({ size }), containerClassName)}>{children}</div>
    </div>
  );
}

export { Card, CardWithCaption };
