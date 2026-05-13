export function NoItemsMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-foreground-light flex h-full flex-1 items-center justify-center">
      {children}
    </div>
  );
}
