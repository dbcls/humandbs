import { Link } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"

import Logo from "@/assets/Logo.png"
import { FileRoutesByTo } from "@/routeTree.gen"

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
    <header className=" flex items-center gap-8 rounded-md bg-white p-4">
      <Link className=" w-fit" to="/">

        <img src={Logo} className=" block" />

        <div className=" text-center text-sm font-semibold">NDBC ヒトデータベース</div>
      </Link>
      <nav>
        <ul className="flex items-center gap-8">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link className=" font-medium" to={item.href}>{item.label}</Link>
            </li>
          ))}

        </ul>
      </nav>

    </header>
  )
}
