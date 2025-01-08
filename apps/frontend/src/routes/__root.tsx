import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

export const Route = createRootRoute({
  component: () => (
    <main className="h-screen w-screen p-2">
      <header className="flex gap-2 p-2">
        <nav className="flex gap-2 p-2">
          <Link to="/" className="[&.active]:font-bold">
            Home
          </Link>
          <Link to="/about" className="[&.active]:font-bold">
            About
          </Link>
          <Link to="/contact" className="[&.active]:font-bold">
            Contact
          </Link>
        </nav>
      </header>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </main>
  ),
})
