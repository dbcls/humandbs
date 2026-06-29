import { icons } from "lucide-react";

import { Button } from "@/components/ui/button";

// Maps the author-facing `variant` values to the design-system button variants.
// `pink` is the brand accent (gradient), `blue` is the secondary action style.
const VARIANT_MAP = {
  pink: "accent",
  blue: "action",
} as const;

type DocButtonVariant = keyof typeof VARIANT_MAP;

function isDocButtonVariant(value?: string): value is DocButtonVariant {
  return value === "pink" || value === "blue";
}

function LucideIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null;
  const Icon = icons[name as keyof typeof icons];
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function DocButton({
  href,
  variant,
  iconBefore,
  iconAfter,
  children,
}: {
  href?: string;
  variant?: string;
  iconBefore?: string;
  iconAfter?: string;
  children?: React.ReactNode;
}) {
  const resolvedVariant = isDocButtonVariant(variant) ? VARIANT_MAP[variant] : VARIANT_MAP.pink;

  return (
    <Button
      asChild
      // inline-flex + w-fit: shrink to content so the button isn't full-width,
      // and let consecutive buttons sit side-by-side on one row (wrapping when
      // the viewport is narrow). my-2/mr-4 give spacing between buttons and
      // surrounding content.
      className="doc-button my-2 mr-4 inline-flex w-fit text-3xl no-underline"
      size="lg"
      variant={resolvedVariant}
    >
      <a href={href} target="_blank" rel="noreferrer noopener">
        <LucideIcon name={iconBefore} className="mr-2 size-6" />
        {children}
        <LucideIcon name={iconAfter} className="ml-2 size-6" />
      </a>
    </Button>
  );
}
