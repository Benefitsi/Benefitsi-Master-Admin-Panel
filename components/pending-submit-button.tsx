"use client"

import { useFormStatus } from "react-dom"
import { LoadingSpinner } from "./loading-ui"

export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
  name,
  value,
}: {
  children: string
  pendingLabel: string
  className: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {pending ? <LoadingSpinner /> : null}
      {pending ? pendingLabel : children}
    </button>
  )
}
