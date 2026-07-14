const regexToParseMakerAndModel =
  /^(?<maker>[A-Za-z0-9\s:]+)(\s\[|\|\|)(?<model>[A-Za-z0-9\s:]+)\]?/i;

export function PlatformBadge({ platform }: { platform: string }) {
  const match = platform.match(regexToParseMakerAndModel);
  if (!match) return platform;

  return (
    <span className="text-xs">
      <span className="text-secondary">{match.groups?.maker}</span>{" "}
      <span className="ml-2">{match.groups?.model}</span>
    </span>
  );
}
