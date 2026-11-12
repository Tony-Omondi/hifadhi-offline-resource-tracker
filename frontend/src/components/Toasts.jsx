import { useCallback, useState } from 'react'
import { Icon } from './Icon'

export function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, ...toast }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.tone === 'error' ? 6000 : 4000)
  }, [])
  return { toasts, push }
}

export function Toasts({ toasts }) {
  const tones = {
    success: ['check', 'text-emerald-400'],
    info: ['merge', 'text-sky-300'],
    error: ['warning', 'text-amber-300'],
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => {
        const [icon, color] = tones[t.tone] ?? tones.info
        return (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-stone-900 px-4 py-3 text-sm text-white shadow-xl">
            <Icon name={icon} size={18} className={`mt-px ${color}`} />
            <p>{t.text}</p>
          </div>
        )
      })}
    </div>
  )
}
