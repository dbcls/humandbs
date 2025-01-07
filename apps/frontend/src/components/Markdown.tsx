import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import { Skeleton } from './Skeleton';

export function Markdown({
  markdown,
  isLoading = false,
}: {
  markdown: string | undefined | null;
  isLoading?: boolean;
}) {
  if (!markdown && !isLoading) {
    return null;
  }

  if (isLoading) {
    return <Skeleton />;
  }

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
