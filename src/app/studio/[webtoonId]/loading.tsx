export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
