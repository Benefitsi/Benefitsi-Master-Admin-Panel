import type { ReactNode } from "react"

export function LoadingSpinner({
  className = "size-4",
  label,
}: {
  className?: string
  label?: string
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  )
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden className={`loading-skeleton block rounded-md ${className}`} />
}

function LoadingScreen({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main aria-busy="true" aria-label={label} className="min-h-screen bg-[#f6f7f4] text-zinc-950">
      <span className="sr-only" role="status">{label}</span>
      {children}
    </main>
  )
}

export function AdminWorkspaceSkeleton() {
  return (
    <LoadingScreen label="Loading admin workspace">
      <div className="grid min-h-screen grid-cols-[72px_1fr] lg:grid-cols-[220px_1fr]">
        <aside className="border-r border-zinc-200 bg-white p-4">
          <Skeleton className="size-10 rounded-xl" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
        </aside>
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="w-full max-w-sm space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-64 max-w-full" />
            </div>
            <Skeleton className="size-10 rounded-full" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20" />)}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[19rem_1fr]">
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
              <Skeleton className="h-10" />
              {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14" />)}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Skeleton className="h-10 w-72 max-w-full" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-16" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </LoadingScreen>
  )
}

export function AuthPageSkeleton() {
  return (
    <LoadingScreen label="Loading sign in">
      <div className="grid min-h-screen place-items-center px-5 py-10">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-52" />
          <Skeleton className="mt-3 h-4 w-full" />
          <div className="mt-7 space-y-5">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </div>
      </div>
    </LoadingScreen>
  )
}

export function MicrositePageSkeleton({ builder = false }: { builder?: boolean }) {
  return (
    <LoadingScreen label={builder ? "Loading microsite builder" : "Loading microsite"}>
      {builder ? (
        <div className="grid min-h-screen lg:grid-cols-[22rem_1fr]">
          <aside className="border-r border-zinc-200 bg-white p-4">
            <Skeleton className="h-10 w-48" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-12" />)}
            </div>
          </aside>
          <div className="bg-zinc-100 p-4 sm:p-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="mt-4 min-h-[70vh] w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-center justify-between gap-5">
            <Skeleton className="h-12 w-44" />
            <Skeleton className="h-10 w-80 max-w-[45%]" />
          </div>
          <Skeleton className="mt-5 h-[58vh] min-h-96 rounded-2xl" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24" />)}
          </div>
        </div>
      )}
    </LoadingScreen>
  )
}
