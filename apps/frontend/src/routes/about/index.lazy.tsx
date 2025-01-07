import { createLazyFileRoute } from '@tanstack/react-router'

import aboutContent from '@content/about-content.md'
import { Markdown } from '@components/Markdown'

export const Route = createLazyFileRoute('/about/')({
  component: About,
})

function About() {
  return <Markdown markdown={aboutContent} />
}
