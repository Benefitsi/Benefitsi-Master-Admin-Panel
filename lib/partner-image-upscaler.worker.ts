import * as ort from "onnxruntime-web/webgpu"

const MODEL_URL = "/models/realesr-general-x4v3-static384.onnx"
const MODEL_CACHE = "benefitsi-partner-upscaler-v1"
const MODEL_INPUT_SIZE = 384
const MODEL_SCALE = 4
const MODEL_VERSION = "1.30.0"
const TILE_OVERLAP = 16

type UpscaleRequest = {
  id: number
  file: File
  width: number
  height: number
  backgroundColor: string
}

type WorkerScope = {
  onmessage: ((event: MessageEvent<UpscaleRequest>) => void) | null
  postMessage: (message: unknown) => void
}

let sessionPromise: Promise<ort.InferenceSession> | null = null
let workQueue = Promise.resolve()
const scope = self as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<UpscaleRequest>) => {
  const request = event.data
  workQueue = workQueue
    .then(() => upscale(request))
    .catch((error: unknown) => {
      scope.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : "Image enhancement failed.",
      })
    })
}

async function upscale(request: UpscaleRequest) {
  let bitmap: ImageBitmap | null = null
  try {
    scope.postMessage({ id: request.id, status: "Loading the AI image model…" })
    const session = await getSession(request.id)
    bitmap = await createImageBitmap(request.file)
    const sourceWidth = bitmap.width
    const sourceHeight = bitmap.height
    if (!sourceWidth || !sourceHeight) throw new Error("Could not read the image dimensions.")

    const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight)
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true })
    if (!sourceContext) throw new Error("Canvas image processing is not supported in this browser.")
    sourceContext.fillStyle = request.backgroundColor
    sourceContext.fillRect(0, 0, sourceWidth, sourceHeight)
    sourceContext.drawImage(bitmap, 0, 0)
    bitmap.close()
    bitmap = null
    const source = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)

    const requiredScale = Math.max(request.width / sourceWidth, request.height / sourceHeight)
    const outputScale = Math.min(MODEL_SCALE, Math.max(1.25, requiredScale * 1.25))
    const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale))
    const outputHeight = Math.max(1, Math.round(sourceHeight * outputScale))
    const outputCanvas = new OffscreenCanvas(outputWidth, outputHeight)
    const outputContext = outputCanvas.getContext("2d")
    if (!outputContext) throw new Error("Canvas image processing is not supported in this browser.")

    const xStarts = tileStarts(sourceWidth)
    const yStarts = tileStarts(sourceHeight)
    const totalTiles = xStarts.length * yStarts.length
    let finishedTiles = 0
    const tileCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE * MODEL_SCALE, MODEL_INPUT_SIZE * MODEL_SCALE)
    const tileContext = tileCanvas.getContext("2d")
    if (!tileContext) throw new Error("Canvas image processing is not supported in this browser.")

    for (let yIndex = 0; yIndex < yStarts.length; yIndex += 1) {
      const sourceY = yStarts[yIndex]
      const validTop = yIndex === 0 ? sourceY : Math.floor((yStarts[yIndex - 1] + MODEL_INPUT_SIZE + sourceY) / 2)
      const validBottom = yIndex === yStarts.length - 1
        ? sourceHeight
        : Math.floor((sourceY + MODEL_INPUT_SIZE + yStarts[yIndex + 1]) / 2)

      for (let xIndex = 0; xIndex < xStarts.length; xIndex += 1) {
        const sourceX = xStarts[xIndex]
        const validLeft = xIndex === 0 ? sourceX : Math.floor((xStarts[xIndex - 1] + MODEL_INPUT_SIZE + sourceX) / 2)
        const validRight = xIndex === xStarts.length - 1
          ? sourceWidth
          : Math.floor((sourceX + MODEL_INPUT_SIZE + xStarts[xIndex + 1]) / 2)

        const inputData = makeInputTensor(source, sourceWidth, sourceHeight, sourceX, sourceY)
        const input = new ort.Tensor("float32", inputData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
        const outputName = session.outputNames[0]
        const result = await session.run({ [session.inputNames[0]]: input })
        const output = result[outputName]
        if (!output || !(output.data instanceof Float32Array)) {
          throw new Error("The AI model returned an unsupported image format.")
        }

        const tilePixels = tensorToImageData(output.data)
        tileContext.putImageData(tilePixels, 0, 0)
        const cropLeft = (validLeft - sourceX) * MODEL_SCALE
        const cropTop = (validTop - sourceY) * MODEL_SCALE
        const cropWidth = (validRight - validLeft) * MODEL_SCALE
        const cropHeight = (validBottom - validTop) * MODEL_SCALE
        outputContext.drawImage(
          tileCanvas,
          cropLeft,
          cropTop,
          cropWidth,
          cropHeight,
          validLeft * outputScale,
          validTop * outputScale,
          cropWidth / MODEL_SCALE * outputScale,
          cropHeight / MODEL_SCALE * outputScale,
        )

        finishedTiles += 1
        scope.postMessage({
          id: request.id,
          progress: Math.round(finishedTiles / totalTiles * 100),
          status: `Enhancing image… ${finishedTiles} of ${totalTiles}`,
        })
      }
    }

    const blob = await outputCanvas.convertToBlob({ type: "image/webp", quality: 0.92 })
    const fileName = `${request.file.name.replace(/\.[^.]+$/, "")}.ai-upscaled-${outputWidth}x${outputHeight}.webp`
    const file = new File([blob], fileName, { type: "image/webp", lastModified: Date.now() })
    scope.postMessage({ id: request.id, file, width: outputWidth, height: outputHeight })
  } catch (error) {
    if (bitmap) bitmap.close()
    throw error
  }
}

function getSession(requestId: number) {
  if (!sessionPromise) sessionPromise = createSession(requestId)
  return sessionPromise
}

async function createSession(requestId: number) {
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${MODEL_VERSION}/dist/`
  ort.env.wasm.numThreads = 1
  const bytes = await getModelBytes(requestId)
  const options = { graphOptimizationLevel: "all" as const }
  if ("gpu" in navigator) {
    try {
      return await ort.InferenceSession.create(bytes, { ...options, executionProviders: ["webgpu"] })
    } catch {
      // Some browsers expose WebGPU while the active adapter cannot run this
      // graph. Retry with the portable browser CPU backend.
    }
  }
  return ort.InferenceSession.create(bytes, { ...options, executionProviders: ["wasm"] })
}

async function getModelBytes(requestId: number) {
  const cache = typeof caches === "undefined" ? null : await caches.open(MODEL_CACHE).catch(() => null)
  const cached = await cache?.match(MODEL_URL)
  if (cached) return cached.arrayBuffer()

  scope.postMessage({ id: requestId, status: "Downloading the AI model to this browser…" })
  const response = await fetch(MODEL_URL, { cache: "force-cache" })
  if (!response.ok) throw new Error("Could not download the local AI image model.")
  const bytes = await response.arrayBuffer()
  if (cache) await cache.put(MODEL_URL, new Response(bytes.slice(0)))
  return bytes
}

function makeInputTensor(
  source: ImageData,
  sourceWidth: number,
  sourceHeight: number,
  sourceX: number,
  sourceY: number,
) {
  const planeSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE
  const values = new Float32Array(planeSize * 3)
  const pixels = source.data
  for (let y = 0; y < MODEL_INPUT_SIZE; y += 1) {
    const imageY = Math.min(sourceHeight - 1, sourceY + y)
    for (let x = 0; x < MODEL_INPUT_SIZE; x += 1) {
      const imageX = Math.min(sourceWidth - 1, sourceX + x)
      const pixelIndex = (imageY * sourceWidth + imageX) * 4
      const planeIndex = y * MODEL_INPUT_SIZE + x
      values[planeIndex] = pixels[pixelIndex] / 255
      values[planeSize + planeIndex] = pixels[pixelIndex + 1] / 255
      values[planeSize * 2 + planeIndex] = pixels[pixelIndex + 2] / 255
    }
  }
  return values
}

function tensorToImageData(values: Float32Array) {
  const width = MODEL_INPUT_SIZE * MODEL_SCALE
  const height = width
  const planeSize = width * height
  const pixels = new Uint8ClampedArray(planeSize * 4)
  for (let index = 0; index < planeSize; index += 1) {
    pixels[index * 4] = Math.round(Math.max(0, Math.min(1, values[index])) * 255)
    pixels[index * 4 + 1] = Math.round(Math.max(0, Math.min(1, values[planeSize + index])) * 255)
    pixels[index * 4 + 2] = Math.round(Math.max(0, Math.min(1, values[planeSize * 2 + index])) * 255)
    pixels[index * 4 + 3] = 255
  }
  return new ImageData(pixels, width, height)
}

function tileStarts(length: number) {
  if (length <= MODEL_INPUT_SIZE) return [0]
  const starts = [0]
  const step = MODEL_INPUT_SIZE - TILE_OVERLAP * 2
  while (starts[starts.length - 1] + MODEL_INPUT_SIZE < length) {
    const current = starts[starts.length - 1]
    const next = Math.min(current + step, length - MODEL_INPUT_SIZE)
    if (next <= current) break
    starts.push(next)
  }
  return starts
}
