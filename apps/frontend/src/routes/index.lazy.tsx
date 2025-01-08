import { Markdown } from "@components/Markdown"
import homeContent from "@content/home-content.md"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/")({
  component: Index,
})

function Index() {
  return (
    <div>
      <Markdown markdown={homeContent} />

      {/* // sample barchart */}
      <svg>
        <rect x="0" y="0" width="100" height="100" fill="red" />
        <rect x="100" y="20" width="100" height="80" fill="green" />
        <rect x="200" y="40" width="100" height="60" fill="blue" />
        <rect x="300" y="0" width="100" height="100" fill="yellow" />
      </svg>
    </div>
  )
}
