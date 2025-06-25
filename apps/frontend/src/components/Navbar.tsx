import { ChevronDown } from "lucide-react";

import Logo from "@/assets/Logo.png";

import { LangSwitcher } from "./LanguageSwitcher";
import { Search } from "./Search";

import { Link, useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export function Navbar() {
  const { lang } = useRouteContext({ from: "/$lang" });

  const t = useTranslations("Navbar");
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
        <ul className="flex flex-wrap items-center gap-8">
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/data-provision"}
            >
              {t("data-submission")}
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/data-usage"}
            >
              {t("data-usage")}
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/about-data"}
            >
              <span>
                {t("about-data")} <ChevronDown className="inline" size={10} />
              </span>
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/achievements"}
            >
              <span>
                {t("achievements")} <ChevronDown className="inline" size={10} />
              </span>
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/contact"}
            >
              <span>
                {t("contact")} <ChevronDown className="inline" size={10} />
              </span>
            </Link>
          </li>
        </ul>
      </nav>
      <div className="flex items-center gap-2">
        <LangSwitcher />
        <Search />
      </div>
    </header>
  );
}
