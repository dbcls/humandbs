import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export function Markdown({ markdown }: { markdown: string }) {
  if (!markdown) {
    return null;
  }
  return (
    <ReactMarkdown
      className={"prose"}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, rehypeRaw]}
    >
      {markdown}
    </ReactMarkdown>
  );
}
