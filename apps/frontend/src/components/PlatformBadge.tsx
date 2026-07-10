const regexToParseMakerAndModel =
  /^(?<maker>[A-Za-z0-9\s:]+)(\s\[|\|\|)(?<model>[A-Za-z0-9\s:]+)\]?/i;

export function PlatformBadge({ platform }: { platform: string }) {
  const match = platform.match(regexToParseMakerAndModel);
  if (!match) return platform;

  return (
    <span className="inline-flex gap-1 text-xs">
      <span className="shrink rounded-l-md py-1 pr-1 pl-2 text-secondary">
        {match.groups?.maker}
      </span>{" "}
      <span className="py-1 pr-2 pl-1">{match.groups?.model}</span>
    </span>
  );
}
