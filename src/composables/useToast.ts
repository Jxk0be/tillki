import { readonly, ref } from 'vue'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
  action?: ToastAction
}

export interface ToastOptions {
  variant?: ToastVariant
  action?: ToastAction
  /** Milliseconds before auto-dismiss. Defaults to 4000, or 6000 when there's an action. */
  duration?: number
}

const toasts = ref<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
}

function show(message: string, options: ToastOptions = {}): number {
  const id = nextId++
  const toast: Toast = { id, message, variant: options.variant ?? 'info', action: options.action }
  // Keep at most 3 on screen; the oldest goes first.
  toasts.value = [...toasts.value.slice(-2), toast]
  const duration = options.duration ?? (options.action ? 6000 : 4000)
  timers.set(
    id,
    setTimeout(() => dismiss(id), duration),
  )
  return id
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    show,
    success: (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      show(message, { ...options, variant: 'success' }),
    error: (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      show(message, { ...options, variant: 'error' }),
    dismiss,
  }
}
