import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ToggleGroupRoot = ToggleGroupPrimitive.Root as any;

function ToggleGroup<T extends string>({
  className,
  variant,
  size,
  children,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
  "onValueChange" | "value"
> &
  VariantProps<typeof toggleVariants> & {
    value?: T;
    onValueChange?: (value: T) => void;
  }) {
  return (
    <ToggleGroupRoot
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs data-[variant=pill]:gap-2",
        {
          "flex items-center rounded-full bg-white/90 p-1.5 backdrop-blur-sm":
            variant === "pill",
        },
        className,
      )}
      onValueChange={onValueChange as ((value: string) => void) | undefined}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupRoot>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  activeClassName,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants> & { activeClassName?: string }) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        "data-[state=off]:bg-foreground-light/20 min-w-0 shrink-0 cursor-pointer shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[state=on]:text-white data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
        activeClassName,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
