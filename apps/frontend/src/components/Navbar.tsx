import Logo from "@/assets/Logo.png";
import { Link, RegisteredRouter } from "@tanstack/react-router";
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
import type { Messages } from "@/lib/i18n-config";
import { ValidateLinkOptions } from "@tanstack/react-router";
import { NavLink } from "./NavLink";

type NavLinkId = keyof Messages["Navbar"];

// First let's define our types
type BaseNavItem = {
  id: NavLinkId;
  to: Omit<ValidateLinkOptions<RegisteredRouter>, "params">["to"];
};

type NavItemWithChildren = BaseNavItem & {
  children?: BaseNavItem[];
};

type NavConfig = NavItemWithChildren[];

const navConfig: NavConfig = [
  {
    id: "data-submission",
    to: "/$lang/data-submission",
    children: [
      {
        id: "data-submission-application",
        to: "/$lang/data-submission/navigation",
      },
    ],
  },
  {
    id: "guidelines",
    to: "/$lang/guidelines",
    children: [
      {
        id: "guidelines-data-sharing",
        to: "/$lang/guidelines/data-sharing",
      },
      {
        id: "guidelines-security-for-users",
        to: "/$lang/guidelines/security-for-users",
      },
      {
        id: "guidelines-security-for-submitters",
        to: "/$lang/guidelines/security-for-submitters",
      },
    ],
  },
  { id: "data-usage", to: "/$lang/data-usage" },
  { id: "about-data", to: "/$lang/about-data" },
  { id: "achievements", to: "/$lang/achievements" },
  { id: "contact", to: "/$lang/contact" },
];

export function Navbar() {
  const t = useTranslations("Navbar");

  const lang = useLocale();

  const tCommon = useTranslations("common");

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
            {navConfig.map((item) => (
              <NavigationMenuItem key={item.id}>
                {item.children ? (
                  <>
                    <NavigationMenuTrigger>
                      <NavLink params={{ lang }} to={item.to}>
                        {t(item.id)}
                      </NavLink>
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="p-2">
                      <ul className="w-max max-w-96 min-w-full">
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <NavigationMenuLink asChild>
                              <NavLink params={{ lang }} to={child.to}>
                                {t(child.id)}
                              </NavLink>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavLink params={{ lang }} to={item.to}>
                    {t(item.id)}
                  </NavLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>
      <div className="flex items-center gap-2">
        <LangSwitcher />
        <Search />
      </div>
    </header>
  );
}
