export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose border-secondary rounded-md border p-4 shadow-md">
      {children}
    </div>
  );
}
