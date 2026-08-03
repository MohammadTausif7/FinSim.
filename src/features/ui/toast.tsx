import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Info, Sparkles, X } from 'lucide-react'
import { toastEvent, type ToastPayload } from './toastEvents'

type ToastItem = Required<ToastPayload> & {
  id: string
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    function receive(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail
      if (!detail?.title) return
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
      const toast: ToastItem = {
        id,
        tone: detail.tone || 'info',
        title: detail.title,
        message: detail.message || '',
      }
      setItems((current) => [toast, ...current].slice(0, 4))
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id))
      }, 4400)
    }
    window.addEventListener(toastEvent, receive)
    return () => window.removeEventListener(toastEvent, receive)
  }, [])

  if (!items.length) return null
  return (
    <div className="toast-viewport" aria-live="polite" aria-label="FinSim notifications">
      {items.map((item) => {
        const Icon = item.tone === 'success' ? Check : item.tone === 'error' ? AlertTriangle : item.tone === 'progress' ? Sparkles : Info
        return (
          <div className={`toast-card ${item.tone}`} key={item.id}>
            <span><Icon /></span>
            <div>
              <strong>{item.title}</strong>
              {item.message && <small>{item.message}</small>}
            </div>
            <button type="button" onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))} aria-label="Dismiss notification">
              <X />
            </button>
          </div>
        )
      })}
    </div>
  )
}
