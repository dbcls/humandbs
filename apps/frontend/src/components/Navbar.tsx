import Logo from "@/assets/Logo.png";
import {
  Link,
  LinkOptions,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";
import { LangSwitcher } from "./LanguageSwitcher";
import { Search } from "./Search";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import type { Locale, Messages } from "@/lib/i18n-config";
import { NavLink } from "./NavLink";
import { authClient } from "@/lib/auth-client";
import { Button } from "./Button";
import { auth } from "@/lib/auth";

type NavLinkId = keyof Messages["Navbar"];

// First let's define our types
type BaseNavItem = {
  id: NavLinkId;
  linkOptions: LinkOptions;
};

type NavItemWithChildren = BaseNavItem & {
  children?: BaseNavItem[];
};

// const l = linkOptions({ to: "/$lang/guidelines/$slug", params: { lang: "en", slug: "guidelines" } });

type NavConfig = NavItemWithChildren[];

const getNavConfig = (lang: Locale): NavConfig => {
  return [
    {
      id: "data-submission",
      linkOptions: { to: "/$lang/data-submission", params: { lang } },
      children: [
        {
          id: "application",
          linkOptions: {
            to: "/$lang/data-submission/application",
            params: {
              lang,
            },
          },
        },
      ],
    },
    {
      id: "guidelines",
      linkOptions: { to: "/$lang/guidelines" },
      children: [
        {
          id: "data-sharing-guidelines",
          linkOptions: {
            to: "/$lang/guidelines/$slug",
            params: {
              lang,
              slug: "data-sharing-guidelines",
            },
          },
        },
        {
          id: "security-guidelines-for-users",
          linkOptions: {
            to: "/$lang/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-users",
            },
          },
        },
        {
          id: "security-guidelines-for-submitters",
          linkOptions: {
            to: "/$lang/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-submitters",
            },
          },
        },
        {
          id: "security-guidelines-for-dbcenters",
          linkOptions: {
            to: "/$lang/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-dbcenters",
            },
          },
        },
      ],
    },
    {
      id: "data-usage",
      linkOptions: { to: "/$lang/data-usage", params: { lang } },
    },
    {
      id: "about-data",
      linkOptions: { to: "/$lang/about-data", params: { lang } },
    },
    {
      id: "achievements",
      linkOptions: { to: "/$lang/achievements", params: { lang } },
    },
    { id: "contact", linkOptions: { to: "/$lang/contact", params: { lang } } },
  ];
};

export function Navbar() {
  const t = useTranslations("Navbar");

  const { user } = useRouteContext({ from: "__root__" });

  const router = useRouter();

  const lang = useLocale();

  const tCommon = useTranslations("common");

  async function handleLogout() {
    await authClient.signOut();
    router.invalidate();
  }

  return (
    <header className="flex items-center justify-between gap-8 rounded-md bg-white p-4">
      <nav className="flex items-center gap-8">
        <Link className="w-fit shrink-0" to=".">
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
                    <NavigationMenuTrigger>
                      <NavLink {...item.linkOptions}>{t(item.id)}</NavLink>
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="z-10 p-2">
                      <ul className="w-max max-w-96 min-w-full">
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <NavigationMenuLink asChild>
                              <NavLink {...child.linkOptions}>
                                {t(child.id)}
                              </NavLink>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavLink {...item.linkOptions}>{t(item.id)}</NavLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>

      <div className="flex items-center gap-2">
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs">{user.name}</span>
            <Button onClick={handleLogout}>Logout</Button>
          </div>
        ) : null}
        <LangSwitcher />
        <Search />
      </div>
    </header>
  );
}
