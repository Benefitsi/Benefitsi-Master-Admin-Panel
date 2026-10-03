"use client"

import { useEffect, useRef, type ReactNode } from "react"

// Each streamed section hydrates independently of the surrounding admin shell.
// Keep its server-rendered text intact until React commits this section.
export function AdminTranslationBoundary({ children, inline = false }: {
  children: ReactNode
  inline?: boolean
}) {
  const elementRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    elementRef.current?.setAttribute("data-admin-i18n-pending", "false")
  }, [])
  const props = {
    ref: (element: HTMLElement | null) => { elementRef.current = element },
    className: "contents",
    "data-admin-i18n-pending": "true",
  }
  return inline ? <span {...props}>{children}</span> : <div {...props}>{children}</div>
}
