export default function Loading() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-2xl px-4 py-3 flex items-center justify-between border-b">
        <div className="h-8 w-32 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
      <div className="w-full max-w-2xl space-y-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-full aspect-[2/3] bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
