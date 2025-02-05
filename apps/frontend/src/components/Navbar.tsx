import { Link } from "@tanstack/react-router"

import Logo from "@/assets/Logo.png"

export function Navbar() {
  return (
    <header className=" bg-primary flex justify-between rounded-md p-1">
      <img src={Logo} className=" block" />
      <nav>
        <ul className="flex gap-2">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/about">About</Link>
          </li>
        </ul>
      </nav>

    </header>
  )
}
