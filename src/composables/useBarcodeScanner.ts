import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { DecodeHintType as HintType } from '@zxing/library'
import { normalizeIsbn } from '@/lib/isbn'

interface DetectedBarcode {
  rawValue: string
}
interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats(): Promise<string[]>
}

type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean }

/**
 * Scans book barcodes (EAN-13 ISBNs) with the rear camera. Uses the browser's
 * own BarcodeDetector when it supports EAN-13 (Chrome on Android), otherwise
 * ZXing (iPhone Safari). Emits only valid ISBN-13s.
 */
export function useBarcodeScanner(
  video: Ref<HTMLVideoElement | null>,
  onIsbn: (isbn: string) => void,
) {
  const active = ref(false)
  const error = ref<string | null>(null)
  const torchAvailable = ref(false)
  const torchOn = ref(false)

  let stream: MediaStream | null = null
  let stopZxing: (() => void) | null = null
  let frame = 0
  let found = false

  function handle(raw: string) {
    const isbn = normalizeIsbn(raw)
    if (!isbn || found) return
    found = true
    navigator.vibrate?.(60)
    stop()
    onIsbn(isbn)
  }

  async function nativeDetector(): Promise<NativeBarcodeDetector | null> {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector
    if (!Detector) return null
    try {
      const formats = await Detector.getSupportedFormats()
      return formats.includes('ean_13') ? new Detector({ formats: ['ean_13'] }) : null
    } catch {
      return null
    }
  }

  async function start() {
    error.value = null
    found = false
    const el = video.value
    if (!el) return
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = "This browser can't use the camera. Type the ISBN instead."
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      error.value = denied
        ? 'Camera access was blocked. Allow it in your browser settings, or type the ISBN.'
        : "Couldn't start the camera. Type the ISBN instead."
      return
    }

    el.srcObject = stream
    el.setAttribute('playsinline', 'true')
    el.muted = true
    await el.play().catch(() => undefined)
    active.value = true

    const track = stream.getVideoTracks()[0]
    const caps = track?.getCapabilities?.() as
      (MediaTrackCapabilities & { torch?: boolean }) | undefined
    torchAvailable.value = Boolean(caps?.torch)

    const detector = await nativeDetector()
    if (detector) {
      const loop = async () => {
        if (!active.value || found) return
        try {
          const codes = await detector.detect(el)
          for (const c of codes) handle(c.rawValue)
        } catch {
          // a frame that couldn't be read; keep going
        }
        frame = requestAnimationFrame(() => void loop())
      }
      void loop()
      return
    }

    // ZXing fallback, loaded only when needed.
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ])
    const hints = new Map<HintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    ])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
    const controls = await reader.decodeFromStream(stream, el, (result) => {
      if (result) handle(result.getText())
    })
    stopZxing = () => controls.stop()
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn.value
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] })
      torchOn.value = next
    } catch {
      torchAvailable.value = false
    }
  }

  function stop() {
    active.value = false
    cancelAnimationFrame(frame)
    stopZxing?.()
    stopZxing = null
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    torchOn.value = false
    if (video.value) video.value.srcObject = null
  }

  onBeforeUnmount(stop)

  return { active, error, torchAvailable, torchOn, start, stop, toggleTorch }
}
