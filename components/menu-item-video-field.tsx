"use client"

import { useEffect, useId, useRef, useState } from "react"
import { validateMenuVideoFile } from "@/lib/menu-video"

export function MenuItemVideoField({ currentUrl, disabled = false, language = "de", onChange }: {
  currentUrl?: string | null
  disabled?: boolean
  language?: "de" | "en"
  onChange: (file: File | null) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const de = language === "de"

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const displayedUrl = previewUrl || (removed ? null : currentUrl)
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
      <legend className="px-1 text-sm font-semibold text-zinc-900">{de ? "Video zum Artikel" : "Item video"}</legend>
      <input type="hidden" name="video_url" value={removed ? "" : currentUrl || ""} />
      <p id={`${inputId}-hint`} className="text-xs text-zinc-500">
        {de ? "Optional: MP4 (H.264), bis 50 MB. Gäste starten das Video durch Antippen." : "Optional: MP4 (H.264), up to 50 MB. Guests tap to play."}
      </p>
      {displayedUrl ? (
        <video key={displayedUrl} src={displayedUrl} controls playsInline preload="none"
          aria-label={de ? "Videovorschau" : "Video preview"}
          className="max-h-64 w-full rounded-lg bg-black" />
      ) : null}
      <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-700">
        {displayedUrl ? (de ? "Video ersetzen" : "Replace video") : (de ? "Video auswählen" : "Choose video")}
      </label>
      <input ref={inputRef} id={inputId} type="file" accept="video/mp4,.mp4"
        aria-describedby={`${inputId}-hint`} aria-invalid={Boolean(error)}
        className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null
          if (!selected) return
          const message = validateMenuVideoFile(selected)
          setError(message)
          if (message) { event.target.value = ""; return }
          setPreviewUrl(URL.createObjectURL(selected)); setRemoved(false); onChange(selected)
        }} />
      {displayedUrl ? (
        <button type="button" disabled={disabled} className="text-xs font-semibold text-rose-700"
          onClick={() => {
            setPreviewUrl(null); setRemoved(true); setError(null); onChange(null)
            if (inputRef.current) inputRef.current.value = ""
          }}>{de ? "Video entfernen" : "Remove video"}</button>
      ) : null}
      {error ? <p role="alert" className="text-xs font-medium text-rose-700">{error}</p> : null}
    </fieldset>
  )
}
