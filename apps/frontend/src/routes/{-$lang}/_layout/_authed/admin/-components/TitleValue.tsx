export function TitleValue({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="font-medium text-sm leading-none">{title}</span>
      <div className="text-xs">{value}</div>
    </div>
  );
}
