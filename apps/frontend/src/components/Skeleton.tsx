export function Skeleton() {
  return (
    <div role="status" className="max-w-sm animate-pulse">
      <div className="mb-4 h-2.5 w-48 rounded-full bg-slate-300"></div>
      <div className="mb-2.5 h-2 max-w-[360px] rounded-full bg-slate-300"></div>
      <div className="mb-2.5 h-2 rounded-full bg-slate-300"></div>
      <div className="mb-2.5 h-2 max-w-[330px] rounded-full bg-slate-300"></div>
      <div className="mb-2.5 h-2 max-w-[300px] rounded-full bg-slate-300"></div>
      <div className="h-2 max-w-[360px] rounded-full bg-slate-300"></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
