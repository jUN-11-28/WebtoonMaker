export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-md px-4 py-8">
      <div className="flex gap-6 mb-8">
        <div className="shrink-0 w-28 sm:w-36 aspect-[3/4] rounded-lg bg-muted animate-pulse" />
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
          <div className="h-4 w-full rounded bg-muted animate-pulse" />
          <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-28 rounded bg-muted animate-pulse mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
