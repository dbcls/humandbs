import {
  useLocation,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import {
  ChevronsRight,
  LucideLogIn,
  LucideLogOut,
  ShoppingCart,
} from "lucide-react";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

import Logo from "@/assets/Logo.png";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import type {
  NavbarItem,
  ResolvedSiteNavigation,
} from "@/config/site-navigation";
import { useCart } from "@/hooks/useCart";

import { LangSwitcher } from "./LanguageSwitcher";
import { Link } from "./Link";
import { MobileNav } from "./MobileNav";
import { getNavbarOverflowLayout } from "./navbar-overflow";
import { Search } from "./Search";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function Navbar() {
  const t = useTranslations("Navbar");
  const tCommon = useTranslations("common");

  const { user } = useRouteContext({ from: "__root__" });
  const { lang, siteNavigation } = useRouteContext({
    from: "/{-$lang}/_layout",
  });

  const items = (siteNavigation as ResolvedSiteNavigation).navbar;
  const navContainerRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const measureItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const measureOverflowTriggerRef = useRef<HTMLDivElement>(null);
  const [overflowIndices, setOverflowIndices] = useState<number[]>([]);

  useLayoutEffect(() => {
    const container = navContainerRef.current;
    if (!container) {
      return;
    }

    const measure = () => {
      const containerWidth = container.clientWidth;
      const gap = getNavigationListGap(navListRef.current);
      const itemWidths = items.map(
        (_, index) => measureItemRefs.current[index]?.scrollWidth ?? 0,
      );
      const overflowTriggerWidth =
        measureOverflowTriggerRef.current?.scrollWidth ?? 0;

      const nextLayout = getNavbarOverflowLayout({
        items,
        itemWidths,
        containerWidth,
        overflowTriggerWidth,
        gap,
      });

      setOverflowIndices((current) =>
        areIndexArraysEqual(current, nextLayout.overflowIndices)
          ? current
          : nextLayout.overflowIndices,
      );
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    measure();

    return () => {
      resizeObserver.disconnect();
    };
  }, [items]);

  const overflowIndexSet = new Set(overflowIndices);
  const visibleItems = items.filter((_, index) => !overflowIndexSet.has(index));
  const hiddenItems = items.filter((_, index) => overflowIndexSet.has(index));

  return (
    <header className="flex items-center justify-between gap-12 rounded-md bg-white p-4">
      <MobileNav />
      <Link
        className="w-fit shrink-0"
        variant={"nav"}
        to="/{-$lang}"
        params={{ lang }}
      >
        <img
          src={Logo}
          width={200}
          height={50}
          className="block w-40 md:w-80"
        />
        <div className="text-center text-sm font-semibold whitespace-nowrap">
          {tCommon("humandb")}
        </div>
      </Link>

      <nav
        ref={navContainerRef}
        className="hidden md:block relative min-w-0 flex-1"
      >
        <NavigationMenu viewport={false} className="min-w-0 w-full">
          <NavigationMenuList
            ref={navListRef}
            className="flex flex-nowrap items-center justify-start gap-4"
          >
            {visibleItems.map((item) => (
              <NavItem key={item.id} item={item} t={t} />
            ))}
            {hiddenItems.length > 0 ? (
              <NavigationMenuItem>
                <OverflowMenu items={hiddenItems} t={t} />
              </NavigationMenuItem>
            ) : null}
          </NavigationMenuList>
        </NavigationMenu>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 -z-10 opacity-0"
        >
          <NavigationMenu viewport={false}>
            <NavigationMenuList className="flex flex-nowrap items-center justify-start gap-8">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  ref={(element) => {
                    measureItemRefs.current[index] = element;
                  }}
                >
                  <NavItem item={item} t={t} />
                </div>
              ))}
              <div ref={measureOverflowTriggerRef}>
                <OverflowTrigger />
              </div>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </nav>

      <div className="flex items-center gap-1 md:gap-2">
        <LangSwitcher />
        <Search />
        {user ? <ShoppingCartButton /> : null}
        <UserMenu />
      </div>
    </header>
  );
}

function NavItem({
  item,
  t,
}: {
  item: NavbarItem;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <NavigationMenuItem>
      {item.children ? (
        <>
          <NavigationMenuTrigger className="text-sm">
            <Link
              variant="nav"
              className="whitespace-nowrap"
              {...item.linkOptions}
            >
              {t(item.id)}
            </Link>
          </NavigationMenuTrigger>
          <NavigationMenuContent className="z-10">
            <ul className="w-max max-w-96 min-w-full">
              {item.children.map((child) => (
                <li key={child.id}>
                  <NavigationMenuLink asChild>
                    <Link variant="nav" {...child.linkOptions}>
                      {t(child.id)}
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </>
      ) : (
        <NavigationMenuLink asChild>
          <Link
            variant="nav"
            className="whitespace-nowrap"
            {...item.linkOptions}
          >
            {t(item.id)}
          </Link>
        </NavigationMenuLink>
      )}
    </NavigationMenuItem>
  );
}

function OverflowMenu({
  items,
  t,
}: {
  items: NavbarItem[];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <OverflowTrigger />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 border bg-white p-2 text-black"
      >
        <NavigationMenu viewport={false} className="w-full max-w-none">
          <NavigationMenuList className="flex w-full flex-col items-stretch justify-start gap-1">
            {items.map((item) => (
              <OverflowMenuItem key={item.id} item={item} t={t} />
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </PopoverContent>
    </Popover>
  );
}

const OverflowTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon"
      className={className ?? "size-8"}
      {...props}
    >
      <ChevronsRight className="size-4" />
      <span className="sr-only">More navigation items</span>
    </Button>
  );
});
OverflowTrigger.displayName = "OverflowTrigger";

function getNavigationListGap(list: HTMLUListElement | null) {
  if (!list) {
    return 0;
  }

  const styles = window.getComputedStyle(list);
  const gapValue = styles.columnGap || styles.gap || "0";
  const parsedGap = Number.parseFloat(gapValue);

  return Number.isFinite(parsedGap) ? parsedGap : 0;
}

function OverflowMenuItem({
  item,
  t,
}: {
  item: NavbarItem;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <NavigationMenuItem className="w-full">
      <NavigationMenuLink asChild>
        <Link
          variant="nav"
          {...item.linkOptions}
          className="w-full rounded-sm px-2 py-2"
        >
          {t(item.id)}
        </Link>
      </NavigationMenuLink>
      {item.children?.length ? (
        <ul className="mt-1 flex flex-col gap-1 pl-4">
          {item.children.map((child) => (
            <li key={child.id}>
              <NavigationMenuLink asChild>
                <Link
                  variant="nav"
                  {...child.linkOptions}
                  className="w-full rounded-sm px-2 py-2 text-sm"
                >
                  {t(child.id)}
                </Link>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      ) : null}
    </NavigationMenuItem>
  );
}

function areIndexArraysEqual(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function UserMenu() {
  const { user } = useRouteContext({ from: "__root__" });
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const navigate = useNavigate();
  const currentLocation = useLocation();

  async function login() {
    await navigate({
      to: "/auth/login",
      search: { redirect: currentLocation.href },
      reloadDocument: true,
    });
  }

  if (!user) {
    return (
      <Button
        className="rounded-full flex justify-center w-14 h-14 text-center"
        size={"icon"}
        variant={"action"}
        onClick={login}
      >
        <LucideLogIn className="size-8" />
      </Button>
    );
  }

  const userInitials = user.name
    ? user.name
        .split(/\s+/)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : "U";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size={"icon"}
          variant={"outline"}
          className="rounded-full flex justify-center w-14 h-14 text-center"
        >
          <span>{userInitials}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="bg-white flex flex-col gap-2"
      >
        <div>{user.name}</div>
        <form method="post" action={"/auth/logout"}>
          <Button
            variant={"plain"}
            type="button"
            className="block w-full text-left text-inherit hover:bg-hover"
            onClick={() =>
              navigate({ to: "/{-$lang}/admin", params: { lang } })
            }
          >
            My Page
          </Button>
          <Button type="submit" className="justify-self-end mt-3">
            Logout
            <LucideLogOut className="ml-2 size-8" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ShoppingCartButton() {
  const { cart } = useCart();
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const navigate = useNavigate({ from: "/{-$lang}" });

  return (
    <Button
      variant={"plain"}
      size="icon"
      onClick={() => navigate({ to: "/{-$lang}/cart", params: { lang } })}
    >
      {cart.length > 0 ? (
        <span className="bg-primary rounded-full h-6 w-6">{cart.length}</span>
      ) : null}
      <ShoppingCart className="text-secondary" />
    </Button>
  );
}
