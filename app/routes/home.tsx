import type { Route } from "./+types/home"

export function meta(_args: Route.MetaArgs) {
  return [{ title: "NBDC Human Database" }]
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">NBDC Human Database</h1>
    </main>
  )
}
