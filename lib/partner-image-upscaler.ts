import type { PartnerMediaSpec } from "./partner-config"

type UpscalerWorkerResponse = {
  id: number
  file?: File
  status?: string
  progress?: number
  error?: string
}

type UpscaleOptions = {
  backgroundColor?: string
  onStatus?: (message: string) => void
}

let worker: Worker | null = null
let nextRequestId = 0
const pending = new Map<number, {
  resolve: (file: File) => void
  reject: (error: Error) => void
  onStatus?: (message: string) => void
}>()
const failedFiles = new WeakSet<File>()

export async function upscalePartnerMediaFile(
  file: File,
  spec: PartnerMediaSpec,
  options: UpscaleOptions = {},
) {
  if (file.name.includes(".ai-upscaled-") || /\.svg(?:$|\?)/i.test(file.name) || failedFiles.has(file)) return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    if (bitmap.width >= spec.width && bitmap.height >= spec.height) return file
  } catch {
    // Let the existing image preparation surface unsupported or damaged files.
    return file
  } finally {
    bitmap?.close()
  }

  try {
    return await runUpscaler(file, spec, options)
  } catch {
    failedFiles.add(file)
    options.onStatus?.("AI upscaling is unavailable; the image will be prepared normally.")
    return file
  }
}

function runUpscaler(file: File, spec: PartnerMediaSpec, options: UpscaleOptions) {
  const id = ++nextRequestId
  const activeWorker = getWorker()
  return new Promise<File>((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus: options.onStatus })
    activeWorker.postMessage({
      id,
      file,
      width: spec.width,
      height: spec.height,
      backgroundColor: options.backgroundColor ?? "#ffffff",
    })
  })
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL("./partner-image-upscaler.worker.ts", import.meta.url), { type: "module" })
  worker.onmessage = (event: MessageEvent<UpscalerWorkerResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) return
    if (response.status) request.onStatus?.(response.status)
    if (response.error) {
      pending.delete(response.id)
      request.reject(new Error(response.error))
    } else if (response.file) {
      pending.delete(response.id)
      request.resolve(response.file)
    }
  }
  worker.onerror = (event) => {
    for (const [id, request] of pending) {
      pending.delete(id)
      request.reject(new Error(event.message || "The browser image enhancement worker stopped."))
    }
    worker?.terminate()
    worker = null
  }
  return worker
}
