import Logo from "@/assets/Logo.png";
import {
  useNavigate,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";
import { LangSwitcher } from "./LanguageSwitcher";
import { Search } from "./Search";

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
import { Link } from "./Link";

export function Navbar() {
  const t = useTranslations("Navbar");

  const lang = useLocale();

  const tCommon = useTranslations("common");

  const { user } = useRouteContext({ from: "__root__" });

  const navigate = useNavigate();

  async function login() {
    await navigate({ to: "/api/auth/login", reloadDocument: true });
  }

  return (
    <header className="flex items-center justify-between gap-8 rounded-md bg-white p-4">
      <nav className="flex items-center gap-8">
        <Link
          className="w-fit shrink-0"
          variant={"nav"}
          to="/{-$lang}"
          params={{ lang }}
        >
          <img src={Logo} width={200} height={50} className="block" />

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

      <div className="flex items-center gap-2">
        <LangSwitcher />
        <Search />

        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs">{user.name}</span>
            <form method="post" action={"/api/auth/logout"}>
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
