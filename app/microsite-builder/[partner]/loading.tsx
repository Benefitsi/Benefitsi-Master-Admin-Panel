export default function MicrositeBuilderLoading() {
  return (
    <main className="min-h-screen bg-[#f3efe7] px-4 py-10 text-zinc-950 sm:px-6">
      <section className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
              Microsite Builder
            </p>
            <h1 className="mt-1 text-xl font-bold text-zinc-950">
              Opening builder
            </h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Loading the partner microsite, saved draft, and live preview workspace.
        </p>
      </section>
    </main>
  )
}
