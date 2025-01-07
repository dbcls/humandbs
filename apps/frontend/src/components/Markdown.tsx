import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
export function Markdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      className={'prose'}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, rehypeRaw]}
    >
      {markdown}
    </ReactMarkdown>
  );
}
