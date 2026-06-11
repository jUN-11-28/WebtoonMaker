export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8 space-y-8">
      <section className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="h-6 w-40 rounded bg-muted animate-pulse" />
            <div className="h-4 w-52 rounded bg-muted animate-pulse" />
            <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="h-16 w-32 rounded-lg bg-muted animate-pulse" />
        </div>
      </section>
      <section>
        <div className="h-6 w-24 rounded bg-muted animate-pulse mb-4" />
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border overflow-hidden">
              <div className="aspect-[3/4] bg-muted animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
