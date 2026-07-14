import { useRouteContext } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ResolvedSiteNavigation } from "@/config/siteNavigation";
import { asLinkProps } from "@/config/siteNavigation";
import { useNavbarItemActive } from "@/hooks/useNavbarItemActive";

import { Link } from "./Link";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { siteNavigation } = useRouteContext({ from: "/{-$lang}/_layout" });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-4">
          <Accordion type="multiple" className="w-full px-3">
            {(siteNavigation as ResolvedSiteNavigation).navbar.map((item) => (
              <MobileNavItem key={item.id} item={item} onNavigate={() => setOpen(false)} />
            ))}
          </Accordion>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavItem({
  item,
  onNavigate,
}: {
  item: ResolvedSiteNavigation["navbar"][number];
  onNavigate: () => void;
}) {
  const isActive = useNavbarItemActive(item);

  if (item.children && item.children.length > 0) {
    return (
      <AccordionItem value={item.id}>
        <AccordionTrigger
          className={
            isActive ? "py-3 font-medium text-base text-secondary" : "py-3 font-medium text-base"
          }
        >
          {item.label}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2 pl-4">
            {item.linkOptions && (
              <Link
                key="linked"
                variant="nav"
                {...asLinkProps(item.linkOptions)}
                onClick={onNavigate}
                className="block py-2 font-medium text-sm"
              >
                {item.label}
              </Link>
            )}
            {item.children.map((child) => (
              <Link
                key={child.id}
                variant="nav"
                {...asLinkProps(child.linkOptions)}
                onClick={onNavigate}
                className="block py-2 font-medium text-sm"
              >
                {child.label}
              </Link>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  if (!item.linkOptions) return null;

  return (
    <div className="border-b py-3 last:border-b-0">
      <Link
        variant="nav"
        {...asLinkProps(item.linkOptions)}
        onClick={onNavigate}
        className="block font-medium text-base"
      >
        {item.label}
      </Link>
    </div>
  );
}
