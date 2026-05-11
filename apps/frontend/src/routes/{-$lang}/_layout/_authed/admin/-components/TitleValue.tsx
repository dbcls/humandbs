export function TitleValue({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode | undefined;
}) {
  return (
    <p className="flex flex-col items-start gap-2">
      <span className="text-sm leading-none font-medium">{title}</span>
      <span className="text-xs">{value}</span>
    </p>
  );
}
