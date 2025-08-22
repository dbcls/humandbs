import Logo from "@/assets/Logo.png";
import {
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
import { Link } from "./Link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

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
      linkOptions: { to: "/$lang/guidelines", params: { lang } },
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
      linkOptions: {
        to: "/$lang/$contentId",
        params: { lang, contentId: "data-usage" },
      },
    },
    {
      id: "about-data",
      linkOptions: {
        to: "/$lang/$contentId",
        params: { lang, contentId: "about-data" },
      },
    },
    {
      id: "achievements",
      linkOptions: {
        to: "/$lang/$contentId",
        params: { lang, contentId: "achievements" },
      },
    },
    {
      id: "contact",
      linkOptions: {
        to: "/$lang/$contentId",
        params: { lang, contentId: "contact" },
      },
    },
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
        <Link
          className="w-fit shrink-0"
          variant={"nav"}
          to="/$lang"
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
            <Button onClick={handleLogout}>Logout</Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
