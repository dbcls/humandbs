import { createLazyFileRoute } from "@tanstack/react-router"

import { Markdown } from "@/components/Markdown"
import aboutContent from "@/content/about-content.md"

export const Route = createLazyFileRoute("/about/")({
  component: About,
})

function About() {
  return <Markdown markdown={aboutContent} />
}
