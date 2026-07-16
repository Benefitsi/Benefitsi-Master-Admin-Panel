"use client"

import { useFormStatus } from "react-dom"
import { LoadingSpinner } from "./loading-ui"

export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: string
  pendingLabel: string
  className: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {pending ? <LoadingSpinner /> : null}
      {pending ? pendingLabel : children}
    </button>
  )
}
