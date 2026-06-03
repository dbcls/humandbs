import { ClientOnly, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { LucideLogIn, LucideLogOut, MoreVertical, ShoppingCart } from "lucide-react";
import { useTranslations } from "use-intl";

import { Fragment, forwardRef, useLayoutEffect, useRef, useState } from "react";

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
import type { ResolvedNavbarItem, ResolvedSiteNavigation } from "@/config/site-navigation";
import { asLinkProps } from "@/config/site-navigation";
import { useCartStore } from "@/hooks/useCart";
import { cn } from "@/lib/utils";
import { getNavbarOverflowLayout } from "@/utils/navbar-overflow";

import { LangSwitcher } from "./LanguageSwitcher";
import { Link } from "./Link";
import { MobileNav } from "./MobileNav";
import { Search } from "./Search";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function Navbar() {
  const tCommon = useTranslations("common");

  const { lang, siteNavigation } = useRouteContext({
    from: "/{-$lang}/_layout",
  });

  const items: ResolvedNavbarItem[] = (siteNavigation as ResolvedSiteNavigation).navbar;
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
      const itemWidths = items.map((_, index) => measureItemRefs.current[index]?.scrollWidth ?? 0);
      const overflowTriggerWidth = measureOverflowTriggerRef.current?.scrollWidth ?? 0;

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
    <header className="flex items-center justify-between gap-12 rounded-md bg-white p-6">
      <MobileNav />
      <Link
        className="w-fit shrink-0 translate-y-2"
        variant={"nav"}
        to="/{-$lang}"
        params={{ lang }}
      >
        <img
          src={Logo}
          width={200}
          height={50}
          alt="Human Data Logo"
          className="block w-40 md:w-80"
        />
        <div className="whitespace-nowrap text-center font-semibold text-xs">
          {tCommon("humandb")}
        </div>
      </Link>

      <NavigationMenu
        ref={navContainerRef}
        viewport={false}
        className="relative hidden w-full min-w-0 max-w-none flex-1 justify-start md:flex"
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
        <ClientOnly fallback={<ShoppingCart className="size-6 text-secondary" />}>
          <ShoppingCartButton />
        </ClientOnly>
        <UserMenu />
      </div>
    </header>
  );
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function NavItem({ item }: { item: ResolvedNavbarItem }) {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLLIElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  useLayoutEffect(() => {
    if (!item.children) return;

    const check = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAlignRight(rect.right > window.innerWidth / 2);
    };

    const observer = new ResizeObserver(check);
    observer.observe(document.documentElement);
    check();

    return () => observer.disconnect();
  }, [item.children]);

  const handleBlur = () => {
    blurActiveElement();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleBlur();
    if (item.linkOptions) {
      navigate(asLinkProps(item.linkOptions));
    }
  };

  return (
    <NavigationMenuItem ref={wrapperRef}>
      {item.children ? (
        <>
          <NavigationMenuTrigger className="text-sm" onClick={handleClick}>
            <span className="whitespace-nowrap">{item.label}</span>
          </NavigationMenuTrigger>
          <NavigationMenuContent className={cn("z-10", alignRight && "right-0 left-auto")}>
            <ul className="w-max min-w-full max-w-[400px]">
              {item.children.map((child) => (
                <li key={child.id}>
                  <NavigationMenuLink asChild>
                    <Link
                      variant="nav"
                      className="w-full"
                      onClick={handleBlur}
                      {...asLinkProps(child.linkOptions)}
                    >
                      {child.label}
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </>
      ) : item.linkOptions ? (
        <NavigationMenuLink asChild>
          <Link variant="nav" className="whitespace-nowrap" {...asLinkProps(item.linkOptions)}>
            {item.label}
          </Link>
        </NavigationMenuLink>
      ) : null}
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
        className="w-72 border-none bg-white px-4 py-4 text-black shadow-lg"
      >
        <NavigationMenu viewport={false} className="w-full max-w-none">
          <NavigationMenuList className="flex w-full flex-col items-stretch justify-start gap-1">
            {items.map((item, index) => (
              <Fragment key={item.id}>
                {index > 0 && (
                  <li className="-mx-4 my-2 h-px bg-primary-translucent" role="separator" />
                )}
                <OverflowMenuItem item={item} />
              </Fragment>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </PopoverContent>
    </Popover>
  );
}

const OverflowTrigger = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  ({ className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant="plain"
        size="icon"
        className={cn(
          "rounded-full text-secondary transition-colors hover:bg-hover",
          className ?? "size-10",
        )}
        {...props}
      >
        <MoreVertical className="size-6" strokeWidth={2.5} />
        <span className="sr-only">More navigation items</span>
      </Button>
    );
  },
);
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
  const handleBlur = () => {
    blurActiveElement();
  };

  return (
    <NavigationMenuItem className="flex w-full flex-col">
      {item.linkOptions ? (
        <NavigationMenuLink asChild>
          <Link
            variant="nav"
            {...asLinkProps(item.linkOptions)}
            className="w-full rounded-sm px-2 py-2 text-sm"
          >
            {item.label}
          </Link>
        </NavigationMenuLink>
      ) : (
        <span className="block w-full px-2 py-1.5 text-neutral-400 text-xs">{item.label}</span>
      )}
      {item.children?.length ? (
        <ul className="flex flex-col gap-1">
          {item.children.map((child) => (
            <li key={child.id}>
              <NavigationMenuLink asChild>
                <Link
                  variant="nav"
                  onClick={handleBlur}
                  {...asLinkProps(child.linkOptions)}
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
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function UserMenu() {
  const { user } = useRouteContext({ from: "__root__" });
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const navigate = useNavigate();
  const router = useRouter();

  async function login() {
    const mypageHref = router.buildLocation({
      to: "/{-$lang}/admin",
      params: { lang },
    }).href;
    await navigate({
      to: "/auth/login",
      search: { redirect: mypageHref },
      reloadDocument: true,
    });
  }

  if (!user) {
    return (
      <Button
        className="flex size-10 items-center justify-center rounded-full p-0 text-center"
        size={"icon"}
        variant={"action"}
        onClick={login}
      >
        <LucideLogIn className="size-6" />
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
          className="flex size-10 items-center justify-center rounded-full p-0 text-center"
        >
          <span className="font-bold text-xs">{userInitials}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex flex-col gap-2 border-none bg-white px-4 py-4 shadow-lg"
      >
        <div>{user.name}</div>
        <form method="post" action={"/auth/logout"}>
          <Button
            variant={"plain"}
            type="button"
            className="block w-full text-left text-inherit hover:bg-hover"
            onClick={() => navigate({ to: "/{-$lang}/admin", params: { lang } })}
          >
            My Page
          </Button>
          <Button type="submit" className="mt-3 justify-self-end">
            Logout
            <LucideLogOut className="ml-2 size-6" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ShoppingCartButton() {
  const { user } = useRouteContext({ from: "__root__" });
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const navigate = useNavigate();
  const router = useRouter();

  const datasetsInCart = useCartStore((state) => state.cartDatasets.length);

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
      className="relative flex size-10 items-center justify-center rounded-full p-0"
      size="icon"
      onClick={handleClick}
    >
      {datasetsInCart > 0 ? (
        <span className="absolute top-0 right-0 w-fit min-w-4 rounded-full bg-accent p-0.5 text-[10px] text-white leading-none">
          {datasetsInCart}
        </span>
      ) : null}
      <ShoppingCart className="size-6 text-secondary" />
    </Button>
  );
}
