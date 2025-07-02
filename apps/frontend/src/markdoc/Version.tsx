import { Children } from "react";

export function Version({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose flex justify-end text-right text-sm">
      <div className="w-fit">{children}</div>
    </div>
  );
}
