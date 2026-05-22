import { Slot } from "@radix-ui/react-slot";
import { isMatch, Link, useMatches } from "@tanstack/react-router";
import { Home, MoreHorizontal } from "lucide-react";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { FileRoutesByTo } from "@/routeTree.gen";

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & {
    separator?: React.ReactNode;
  }
>(({ ...props }, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />);
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<"ol">>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      className={cn(
        "flex flex-wrap items-center gap-1.5 break-words text-muted-foreground text-sm sm:gap-2.5",
        className,
      )}
      {...props}
    />
  ),
);
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn("inline-flex items-center gap-1.5", className)} {...props} />
  ),
);
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & {
    asChild?: boolean;
  }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      ref={ref}
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  ),
);
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentProps<"li">) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("[&>svg]:h-3.5 [&>svg]:w-3.5", className)}
    {...props}
  >
    {children ?? "/"}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="size-4" />
    <span className="sr-only">More</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbElipssis";

export interface BreadcroumbsPath {
  label: string;
  href: keyof FileRoutesByTo;
}

interface CrumbEntry {
  label: string;
  href: string;
}

function Breadcrumbs() {
  const matches = useMatches();

  const crumbs = React.useMemo(() => {
    const result: CrumbEntry[] = [];
    for (const match of matches) {
      if (isMatch(match, "loaderData.crumbs")) {
        const multi = match.loaderData?.crumbs as CrumbEntry[];
        result.push(...multi);
      } else if (isMatch(match, "loaderData.crumb")) {
        result.push({ label: match.loaderData?.crumb ?? "", href: match.fullPath });
      }
    }
    return result;
  }, [matches]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map(({ label, href }, index) => (
          <React.Fragment key={`${href}-${index}`}>
            <BreadcrumbItem>
              <Link
                //@ts-expect-error
                to={href}
                className={cn("text-foreground-light", {
                  "text-secondary": index === crumbs.length - 1,
                })}
              >
                {index === 0 ? <Home className="mr-1 inline" size={12} /> : null}
                {label}
              </Link>
            </BreadcrumbItem>
            {index < crumbs.length - 1 && <BreadcrumbSeparator className="text-foreground-light" />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
};
