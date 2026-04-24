import {
  useLocation,
  useNavigate,
  useRouteContext,
  useRouter,
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
  ResolvedNavbarItem,
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
  const tCommon = useTranslations("common");

  const { lang, siteNavigation } = useRouteContext({
    from: "/{-$lang}/_layout",
  });

  const items: ResolvedNavbarItem[] = (siteNavigation as ResolvedSiteNavigation)
    .navbar;
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

      <NavigationMenu
        ref={navContainerRef}
        viewport={false}
        className="relative hidden w-full max-w-none min-w-0 flex-1 justify-start md:flex"
      >
        <NavigationMenuList
          ref={navListRef}
          className="flex flex-nowrap items-center justify-start gap-4"
        >
          {visibleItems.map((item) => (
            <NavItem key={item.id} item={item} />
          ))}
          {hiddenItems.length > 0 ? (
            <NavigationMenuItem>
              <OverflowMenu items={hiddenItems} />
            </NavigationMenuItem>
          ) : null}
        </NavigationMenuList>
      </NavigationMenu>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 -z-10 overflow-hidden opacity-0"
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
                <NavItem item={item} />
              </div>
            ))}
            <div ref={measureOverflowTriggerRef}>
              <OverflowTrigger />
            </div>
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        <LangSwitcher />
        <Search />
        <ShoppingCartButton />
        <UserMenu />
      </div>
    </header>
  );
}

function NavItem({ item }: { item: ResolvedNavbarItem }) {
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
              {item.label}
            </Link>
          </NavigationMenuTrigger>
          <NavigationMenuContent className="z-10">
            <ul className="w-max max-w-96 min-w-full">
              {item.children.map((child) => (
                <li key={child.id}>
                  <NavigationMenuLink asChild>
                    <Link variant="nav" {...child.linkOptions}>
                      {child.label}
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
            {item.label}
          </Link>
        </NavigationMenuLink>
      )}
    </NavigationMenuItem>
  );
}

function OverflowMenu({ items }: { items: ResolvedNavbarItem[] }) {
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
              <OverflowMenuItem key={item.id} item={item} />
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

function OverflowMenuItem({ item }: { item: ResolvedNavbarItem }) {
  return (
    <NavigationMenuItem className="w-full">
      <NavigationMenuLink asChild>
        <Link
          variant="nav"
          {...item.linkOptions}
          className="w-full rounded-sm px-2 py-2"
        >
          {item.label}
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
                  {child.label}
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
        className="flex h-14 w-14 justify-center rounded-full text-center"
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
          className="flex h-14 w-14 justify-center rounded-full text-center"
        >
          <span>{userInitials}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex flex-col gap-2 bg-white"
      >
        <div>{user.name}</div>
        <form method="post" action={"/auth/logout"}>
          <Button
            variant={"plain"}
            type="button"
            className="hover:bg-hover block w-full text-left text-inherit"
            onClick={() =>
              navigate({ to: "/{-$lang}/admin", params: { lang } })
            }
          >
            My Page
          </Button>
          <Button type="submit" className="mt-3 justify-self-end">
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
  const { user } = useRouteContext({ from: "__root__" });
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const navigate = useNavigate();
  const router = useRouter();

  function handleClick() {
    if (!user) {
      const cartHref = router.buildLocation({
        to: "/{-$lang}/cart",
        params: { lang },
      }).href;
      void navigate({
        to: "/auth/login",
        search: { redirect: cartHref },
        reloadDocument: true,
      });
    } else {
      void navigate({ to: "/{-$lang}/cart", params: { lang } });
    }
  }

  return (
    <Button
      variant={"plain"}
      className="relative"
      size="icon"
      onClick={handleClick}
    >
      {cart.length > 0 ? (
        <span className="bg-accent absolute top-0 left-0 w-fit min-w-8 rounded-full p-0.5 text-xs text-white">
          {cart.length}
        </span>
      ) : null}
      <ShoppingCart className="text-secondary" />
    </Button>
  );
}
