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

const BUBBLE_STYLES = `
@keyframes pixel-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes pixel-shrink {
  from { transform: translateY(0); opacity: 1; }
  to   { transform: translateY(18px); opacity: 0; }
}
.pixel-toast-enter { animation: pixel-pop .3s cubic-bezier(.34,1.56,.64,1) forwards; }
.pixel-toast-exit  { animation: pixel-shrink .3s ease-in forwards; }
`

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

  const tailColor = (type: ToastType) =>
    type === 'success'
      ? 'border-t-green-500'
      : type === 'error'
        ? 'border-t-red-500'
        : 'border-t-blue-500'

  const shadowColor = (type: ToastType) =>
    type === 'success'
      ? 'shadow-[4px_4px_0_rgba(34,197,94,.35)]'
      : type === 'error'
        ? 'shadow-[4px_4px_0_rgba(220,38,38,.35)]'
        : 'shadow-[4px_4px_0_rgba(59,130,246,.3)]'

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <style>{BUBBLE_STYLES}</style>
      <div className="fixed bottom-6 right-4 z-50 flex flex-col-reverse gap-4 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto relative flex items-start gap-2 rounded-none border-2 px-4 py-3 text-sm font-mono ${
              t.dismissing ? 'pixel-toast-exit' : 'pixel-toast-enter'
            } ${
              t.type === 'success'
                ? 'bg-green-500/15 border-green-500 text-green-600 dark:text-green-400'
                : t.type === 'error'
                  ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400'
                  : 'bg-blue-500/15 border-blue-500 text-foreground'
            } ${shadowColor(t.type)}`}
          >
            {/* Speech-bubble tail ▼ */}
            <div
              className={`absolute -bottom-[10px] left-4
                w-0 h-0
                border-l-[8px] border-l-transparent
                border-r-[8px] border-r-transparent
                border-t-[10px] ${tailColor(t.type)}`}
            />
            <span className="flex-1 min-w-0 leading-5">{t.text}</span>
            <button
              className="shrink-0 p-1 opacity-50 hover:opacity-100 transition-opacity bg-transparent border-0"
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