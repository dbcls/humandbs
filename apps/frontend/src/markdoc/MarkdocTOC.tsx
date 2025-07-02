import { Heading } from "@/serverFunctions/getContent";

export function MarkdocTOC({ headings }: { headings: Heading[] }) {
  const headingsToShow = headings.filter((heading) => heading.level <= 2);

  return (
    <div className="border-secondary static flex max-w-96 min-w-44 flex-col gap-2 rounded bg-white p-2 md:sticky md:top-4 md:mt-6">
      {headingsToShow.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          {heading.title}
        </a>
      ))}
    </div>
  );
}
