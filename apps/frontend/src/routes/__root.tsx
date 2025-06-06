import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

import { Footer } from "@/components/Footer"
import { Navbar } from "@/components/Navbar"

export const Route = createRootRoute({
  component: () => (
    <>

      <main className="flex flex-col gap-2 p-4">
        <Navbar />

        <Outlet />

        <TanStackRouterDevtools />

      </main>
      <Footer />
    </>

  ),

})
