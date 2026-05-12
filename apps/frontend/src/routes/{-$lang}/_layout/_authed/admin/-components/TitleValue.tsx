export function TitleValue({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm leading-none font-medium">{title}</span>
      <div className="text-xs">{value}</div>
    </div>
  );
}
