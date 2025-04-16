import { createLazyFileRoute } from "@tanstack/react-router"

import { Markdown } from "@/components/Markdown"
import aboutContent from "@/content/about-content.md"

export const Route = createLazyFileRoute("/(other)/_layout/about-data/")({
  component: About,
})

function About() {
  return <Markdown markdown={aboutContent} />
}
