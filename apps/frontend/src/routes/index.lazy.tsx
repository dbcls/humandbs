import { createLazyFileRoute } from '@tanstack/react-router';
import homeContent from '@content/home-content.md';
import { Markdown } from '@components/Markdown';

export const Route = createLazyFileRoute('/')({
  component: Index,
});

function Index() {

  

  
  return (
    <div>
      <Markdown markdown={homeContent} />

      {/* // sample barchart */}
      <svg>
        <rect x="0" y="0" width="100" height="100" fill="red" />
        <rect x="100" y="0" width="100" height="50" fill="green" />
        <rect x="100" y="50" width="100" height="50" fill="blue" />
        <rect x="200" y="0" width="100" height="100" fill="yellow" />
      </svg>
    </div>
  );
}
