import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

import { Skeleton } from "./Skeleton"

export function Markdown({
  markdown,
  isLoading = false,
}: {
  markdown: string | undefined | null;
  isLoading?: boolean;
}) {
  if (!markdown && !isLoading) {
    return null
  }

  if (isLoading) {
    return <Skeleton />
  }

  return (
    <ReactMarkdown
      className={"prose"}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, rehypeRaw]}
    >
      {markdown}
    </ReactMarkdown>
  )
}
