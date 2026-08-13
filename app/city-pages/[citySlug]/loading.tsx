export default function CityPageLoading() {
  return (
    <main
      className="min-h-[100dvh] bg-[#f7f6f1] px-4 py-6 text-[#061829] lg:px-7"
      aria-busy="true"
      aria-label="Stadtverwaltung wird geladen"
    >
      <div className="mx-auto max-w-[1400px] animate-pulse">
        <div className="h-8 w-72 rounded-lg bg-[#dfe4e4]" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-[#e8ebea]" />

        <div className="mt-8 grid overflow-hidden rounded-3xl bg-[#061829] sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="border-white/10 p-5 sm:border-l sm:first:border-l-0">
              <div className="h-8 w-12 rounded bg-white/15" />
              <div className="mt-3 h-3 w-28 rounded bg-white/10" />
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
          <div className="h-[42rem] rounded-3xl border border-[#061829]/10 bg-white" />
          <div className="space-y-4">
            <div className="h-72 rounded-3xl border border-[#061829]/10 bg-white" />
            <div className="h-56 rounded-3xl border border-[#061829]/10 bg-white" />
          </div>
        </div>
      </div>
    </main>
  )
}
