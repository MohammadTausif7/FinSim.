type ToastTone = 'success' | 'error' | 'info' | 'progress'

export type ToastPayload = {
  tone?: ToastTone
  title: string
  message?: string
}

export const toastEvent = 'finsim-toast'

export function notify(payload: ToastPayload) {
  window.dispatchEvent(new CustomEvent<ToastPayload>(toastEvent, {
    detail: payload,
  }))
}
