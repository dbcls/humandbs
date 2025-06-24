import { ChevronDown } from "lucide-react";

import Logo from "@/assets/Logo.png";

import { LangSwitcher } from "./LanguageSwitcher";
import { Search } from "./Search";

import { Link, useRouteContext } from "@tanstack/react-router";

export function Navbar() {
  const { lang } = useRouteContext({ from: "/$lang" });

  return (
    <header className="flex items-center justify-between gap-8 rounded-md bg-white p-4">
      <nav className="flex items-center gap-8">
        <Link className="w-fit" to=".">
          <img src={Logo} className="block" />

          <div className="text-center text-sm font-semibold whitespace-nowrap">
            NDBC ヒトデータベース
          </div>
        </Link>
        <ul className="flex flex-wrap items-center gap-8">
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/data-provision"}
            >
              データの提供
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/data-usage"}
            >
              データの利用
            </Link>
          </li>
          <li>
            <Link
              className="font-medium whitespace-nowrap"
              params={{ lang }}
              to={"/$lang/about-data"}
            >
              <span>
                データについて <ChevronDown className="inline" size={10} />
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
                実績 <ChevronDown className="inline" size={10} />
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
                お問い合わせ <ChevronDown className="inline" size={10} />
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
