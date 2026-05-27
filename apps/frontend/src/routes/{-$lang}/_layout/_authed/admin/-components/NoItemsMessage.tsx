export function NoItemsMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center text-foreground-light">
      {children}
    </div>
  );
}
