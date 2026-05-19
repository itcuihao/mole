import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  type: ToastType
  text: string
  dismissing: boolean
}

type ToastFn = (opts: { type: ToastType; text: string; duration?: number }) => void

const ToastContext = createContext<ToastFn>(() => {})

let nextId = 0

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback<ToastFn>((opts) => {
    const id = nextId++
    const item: ToastItem = { id, type: opts.type, text: opts.text, dismissing: false }
    setToasts(prev => [...prev.slice(-2), item])

    const duration = opts.duration ?? (opts.type === 'error' ? 0 : opts.type === 'info' ? 4000 : 3000)
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, dismissing: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
              t.dismissing
                ? 'opacity-0 translate-y-2'
                : 'opacity-100 translate-y-0'
            } ${
              t.type === 'success'
                ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
                : t.type === 'error'
                  ? 'bg-destructive/10 border-destructive/50 text-destructive'
                  : 'bg-primary/10 border-primary/30 text-foreground'
            }`}
          >
            <span className="flex-1 min-w-0">{t.text}</span>
            <button
              className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              onClick={() => dismiss(t.id)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}