"use client"

import { useEffect } from "react"

export function CityEditorFormBehavior() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("[data-city-editor-form]")
    if (!form) return

    let dirty = false
    const setDisabled = (wrapper: HTMLElement, disabled: boolean) => {
      wrapper.querySelectorAll<HTMLElement>("input, textarea, select").forEach((control) => {
        if (control.dataset.modeControl === "true") return
        if (disabled) control.setAttribute("disabled", "true")
        else control.removeAttribute("disabled")
      })
    }

    const onInput = (event: Event) => {
      dirty = true
      const target = event.target as HTMLElement
      const wrapper = target.closest<HTMLElement>("[data-field-control]")
      if (!wrapper) return
      const mode = wrapper.querySelector<HTMLSelectElement>("[data-mode-control='true']")
      if (mode?.value === "AUTO") mode.value = "MANUAL"
    }
    const onModeChange = (event: Event) => {
      dirty = true
      const target = event.target as HTMLSelectElement
      if (target.dataset.modeControl !== "true") return
      const wrapper = target.closest<HTMLElement>("[data-field-control]")
      if (wrapper) setDisabled(wrapper, target.value === "LOCKED")
    }
    const onSubmit = () => {
      dirty = false
      // Disabled controls are omitted from FormData by the browser. Submit
      // their current values as well; the server still enforces LOCKED and
      // validates every incoming value against the stored record.
      form
        .querySelectorAll<HTMLElement>("[data-field-input='true']")
        .forEach((control) => control.removeAttribute("disabled"))
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ""
    }

    form.addEventListener("input", onInput)
    form.addEventListener("change", onModeChange)
    form.addEventListener("submit", onSubmit)
    window.addEventListener("beforeunload", onBeforeUnload)
    form.querySelectorAll<HTMLElement>("[data-field-control]").forEach((wrapper) => {
      const mode = wrapper.querySelector<HTMLSelectElement>("[data-mode-control='true']")
      if (mode) setDisabled(wrapper, mode.value === "LOCKED")
    })

    return () => {
      form.removeEventListener("input", onInput)
      form.removeEventListener("change", onModeChange)
      form.removeEventListener("submit", onSubmit)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [])

  return null
}
