import {
  fieldControlLabel,
  fieldControlModes,
  type FieldControlMode,
} from "@/lib/city-pages/field-controls"

export function FieldModeSelect({
  fieldPath,
  mode,
}: {
  fieldPath: string
  mode: FieldControlMode
}) {
  const id = `mode-${fieldPath.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  return (
    <label className="flex items-center gap-2 text-[11px] font-bold text-[#71808b]">
      Pflege
      <select
        id={id}
        name={`mode_${fieldPath}`}
        defaultValue={mode}
        data-mode-control="true"
        className="min-h-8 rounded-lg border border-[#061829]/12 bg-white px-2 text-[11px] font-black text-[#344454] outline-none focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/10"
      >
        {fieldControlModes.map((value) => (
          <option key={value} value={value}>
            {fieldControlLabel(value)}
          </option>
        ))}
      </select>
    </label>
  )
}
