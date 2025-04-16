import { useQuery } from "@tanstack/react-query"
import { createLazyFileRoute } from "@tanstack/react-router"

import { Markdown } from "@/components/Markdown"

export const Route = createLazyFileRoute("/(other)/_layout/contact/")({
  component: RouteComponent,
})

/**
 * Dynamically load markdown from any github public repo
 */

function RouteComponent() {
  const { data: markdown, isLoading } = useQuery({
    queryKey: ["contact"],
    queryFn: async () => {
      return fetch(
        "https://raw.githubusercontent.com/tailwindlabs/tailwindcss/refs/heads/next/README.md",
      ).then((res) => res.text())
    },
  })

  return <Markdown isLoading={isLoading} markdown={markdown} />
}
