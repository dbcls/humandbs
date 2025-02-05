import { Link } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"

import Logo from "@/assets/Logo.png"
import { FileRoutesByTo } from "@/routeTree.gen"

import { LangSwitcher } from "./LanguageSwitcher"
import { Search } from "./Search"

type Path = keyof FileRoutesByTo

const navItems: { label: React.ReactNode, href: Path }[] = [
  {
    label: "データの提供",
    href: "/data-provision",
  },
  {
    label: "データの利用",
    href: "/data-usage",
  },
  {
    label: <span>データについて <ChevronDown className=" inline" size={10} /> </span>,
    href: "/about-data",
  },
  {
    label: <span>実績 <ChevronDown className=" inline" size={10} /> </span>,
    href: "/achievements",
  },
  {
    label: <span>お問い合わせ <ChevronDown className=" inline" size={10} /> </span>,
    href: "/contact",
  },

]

export function Navbar() {
  return (
    <header className=" flex items-center justify-between gap-8 rounded-md bg-white p-4">

      <nav className=" flex items-center gap-8">
        <Link className=" w-fit" to="/">

          <img src={Logo} className=" block" />

          <div className=" whitespace-nowrap text-center text-sm font-semibold">NDBC ヒトデータベース</div>
        </Link>
        <ul className="flex flex-wrap items-center gap-8">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link className=" whitespace-nowrap font-medium" to={item.href}>{item.label}</Link>
            </li>
          ))}

        </ul>
      </nav>
      <div className=" flex items-center gap-2">

        <LangSwitcher />
        <Search />
      </div>
    </header>
  )
}
