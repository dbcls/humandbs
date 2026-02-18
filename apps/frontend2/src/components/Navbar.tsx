import {
  useLocation,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

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
import { getNavConfig } from "@/config/navbar-config";
import { useCart } from "@/hooks/useCart";

import { LangSwitcher } from "./LanguageSwitcher";
import { Link } from "./Link";
import { MobileNav } from "./MobileNav";
import { Search } from "./Search";

export function Navbar() {
  const t = useTranslations("Navbar");

  const lang = useLocale();

  const tCommon = useTranslations("common");

  const { user } = useRouteContext({ from: "__root__" });

  const navigate = useNavigate();

  const currentLocation = useLocation();

  async function login() {
    await navigate({
      to: "/auth/login",
      search: {
        redirect: currentLocation.href,
      },
      reloadDocument: true,
    });
  }

  return (
    <header className="flex items-center justify-between gap-4 rounded-md bg-white p-4 md:gap-8">
      <MobileNav />
      <nav className="hidden items-center gap-8 md:flex">
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
            className="block w-32 md:w-[200px]"
          />

          <div className="text-center text-sm font-semibold whitespace-nowrap">
            {tCommon("humandb")}
          </div>
        </Link>

        <NavigationMenu viewport={false}>
          <NavigationMenuList className="flex flex-wrap items-center gap-8">
            {getNavConfig(lang).map((item) => (
              <NavigationMenuItem key={item.id}>
                {item.children ? (
                  <>
                    <NavigationMenuTrigger className="text-sm">
                      <Link variant={"nav"} {...item.linkOptions}>
                        {t(item.id)}
                      </Link>
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="z-10 p-2">
                      <ul className="w-max max-w-96 min-w-full">
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <NavigationMenuLink asChild>
                              <Link variant={"nav"} {...child.linkOptions}>
                                {t(child.id)}
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </>
                ) : (
                  <Link variant={"nav"} {...item.linkOptions}>
                    {t(item.id)}
                  </Link>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>

      <div className="flex items-center gap-1 md:gap-2">
        <LangSwitcher />
        <Search />

        {user ? (
          <div className="flex items-center gap-1 md:gap-2">
            <ShoppingCartButton />

            <span className="mx-4 hidden text-xs sm:inline">{user.name}</span>
            <form method="post" action={"/auth/logout"}>
              <Button type="submit">Logout</Button>
            </form>
          </div>
        ) : (
          <Button onClick={login}> Login </Button>
        )}
      </div>
    </header>
  );
}

function ShoppingCartButton() {
  const { cart } = useCart();

  const navigate = useNavigate({ from: "/{-$lang}" });

  return (
    <Button
      className="relative mr-2 h-fit"
      variant={"plain"}
      onClick={() => navigate({ to: "./cart" })}
    >
      {cart.length > 0 && (
        <span className="bg-accent text-2xs absolute top-0 right-0 z-10 inline min-w-6 rounded-full p-1 leading-4 text-white">
          {cart.length}
        </span>
      )}

      <ShoppingCart className="text-secondary" />
    </Button>
  );
}
