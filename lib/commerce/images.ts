/** Shared by partner image previews and server-side configuration validation. */
export function commerceImageUrl(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('invalid_image_url')
  const image=value.trim()
  if (!image) return null
  if (image.length>2000 || /[\s\\]/.test(image)) throw new Error('invalid_image_url')
  if (/^\/(?![\/\\])[^\\\s]+$/.test(image)) return image
  if (!/^https:\/\/[^/@\s]+([/:]|$)/.test(image)) throw new Error('invalid_image_url')
  try {
    const url=new URL(image)
    if (url.protocol!=='https:' || !url.hostname || url.username || url.password) throw new Error('invalid_image_url')
  } catch { throw new Error('invalid_image_url') }
  return image
}
