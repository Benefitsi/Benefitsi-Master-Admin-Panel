export function formDataSignature(formData: FormData): string {
  return Array.from(formData.entries())
    .filter(([key]) => key !== "cover_processing")
    // Browsers create a new timestamped File for every empty file input read.
    // A named zero-byte file is still a real selection and must be retained.
    .filter(([, value]) => typeof value === "string" || value.name !== "" || value.size !== 0)
    // Sort field names only: repeated fields such as cover_order are ordered data.
    // The stable sort retains their submission order while ignoring layout changes.
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) =>
      typeof value !== "string"
        ? [key, "file", value.name, value.type, value.size, value.lastModified]
        : [key, "string", value],
    )
    .map((entry) => JSON.stringify(entry))
    .join("\n")
}
