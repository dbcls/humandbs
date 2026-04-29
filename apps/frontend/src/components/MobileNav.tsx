import { Menu } from "lucide-react";
import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "./Link";
import { asLinkProps } from "@/config/site-navigation";
import type { ResolvedSiteNavigation } from "@/config/site-navigation";

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
            {(siteNavigation as ResolvedSiteNavigation).navbar.map((item) => {
              if (item.children && item.children.length > 0) {
                return (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger className="py-3 text-base">
                      {item.label}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-2 pl-4">
                        {item.children.map((child) => (
                          <Link
                            key={child.id}
                            variant="nav"
                            {...asLinkProps(child.linkOptions)}
                            onClick={() => setOpen(false)}
                            className="block py-2 text-sm"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              }

              return (
                <div key={item.id} className="border-b py-3 last:border-b-0">
                  <Link
                    variant="nav"
                    {...asLinkProps(item.linkOptions)}
                    onClick={() => setOpen(false)}
                    className="block text-base font-medium"
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </Accordion>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
