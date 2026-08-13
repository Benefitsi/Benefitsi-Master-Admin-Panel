export default function BookingLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-[#f7f6f1] p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="h-12 w-72 rounded-2xl bg-[#061829]/10" />
        <div className="h-28 rounded-3xl bg-[#061829]" />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-96 rounded-3xl bg-white" />
          <div className="h-96 rounded-3xl bg-white" />
        </div>
      </div>
    </main>
  )
}
