import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { MOLE_SPEAK_WAILS_EVENT, type MoleSpeakDetail } from './mascot-events'

export type MoleMessageType = 'success' | 'error' | 'info'

export type MoleMessage = {
  type: MoleMessageType
  text: string
  duration?: number
}

type DisplayState = 'entering' | 'visible' | 'exiting'

type DisplayMessage = {
  message: MoleMessage
  state: DisplayState
}

type MascotTrack = {
  left: number
  top: number
  width: number
  height: number
}

type MoleMessageContextValue = {
  speakBubble: (msg: MoleMessage) => void
  isSpeaking: boolean
  setMascotTrack: (track: MascotTrack) => void
  setMascotX: (x: number) => void
}

const MoleMessageContext = createContext<MoleMessageContextValue | null>(null)

export function useMoleSpeaker() {
  const ctx = useContext(MoleMessageContext)
  if (!ctx) throw new Error('useMoleSpeaker must be used within MoleMessageProvider')
  return ctx.speakBubble
}

export function useMoleSpeaking() {
  const ctx = useContext(MoleMessageContext)
  if (!ctx) throw new Error('useMoleSpeaking must be used within MoleMessageProvider')
  return ctx.isSpeaking
}

export function useSetMascotTrack() {
  const ctx = useContext(MoleMessageContext)
  if (!ctx) throw new Error('useSetMascotTrack must be used within MoleMessageProvider')
  return ctx.setMascotTrack
}

export function useSetMascotX() {
  const ctx = useContext(MoleMessageContext)
  if (!ctx) throw new Error('useSetMascotX must be used within MoleMessageProvider')
  return ctx.setMascotX
}

const BUBBLE_STYLES = `
@keyframes mole-bubble-pop {
  0% { transform: translateX(-50%) scale(0) translateY(4px); opacity: 0; }
  50% { transform: translateX(-50%) scale(1.06); opacity: 1; }
  100% { transform: translateX(-50%) scale(1) translateY(0); opacity: 1; }
}
@keyframes mole-bubble-fade {
  0% { transform: translateX(-50%) scale(1) translateY(0); opacity: 1; }
  100% { transform: translateX(-50%) scale(0.92) translateY(-6px); opacity: 0; }
}
.mole-speech-bubble {
  position: relative;
  max-width: 340px;
  padding: 10px 16px;
  border: 2px solid;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 3px 3px 0 rgba(0,0,0,0.18);
  word-break: break-word;
  transform: translateX(-50%);
}
.mole-bubble-info {
  background: hsl(var(--card));
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}
.mole-bubble-success {
  background: hsl(142 76% 94%);
  border-color: #16a34a;
  color: hsl(142 50% 16%);
}
.mole-bubble-error {
  background: hsl(0 76% 95%);
  border-color: hsl(var(--destructive));
  color: hsl(var(--destructive));
}
.mole-speech-tail {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 10px solid;
}
.mole-tail-info {
  border-bottom-color: hsl(var(--border));
}
.mole-tail-success {
  border-bottom-color: #16a34a;
}
.mole-tail-error {
  border-bottom-color: hsl(var(--destructive));
}
.mole-bubble-entering {
  animation: mole-bubble-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.mole-bubble-exiting {
  animation: mole-bubble-fade 0.25s ease-in forwards;
}
.dark .mole-bubble-success {
  background: hsl(142 50% 12%);
  border-color: #22c55e;
  color: hsl(142 76% 82%);
}
.dark .mole-bubble-error {
  background: hsl(0 50% 12%);
  border-color: hsl(var(--destructive));
  color: hsl(0 76% 82%);
}
.dark .mole-tail-success {
  border-bottom-color: #22c55e;
}
.dark .mole-tail-error {
  border-bottom-color: hsl(var(--destructive));
}
`

const DEFAULT_DURATIONS: Record<MoleMessageType, number> = {
  success: 3000,
  error: 0,
  info: 4000,
}

const MOLE_WIDTH = 48

export function MoleMessageProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<MoleMessage[]>([])
  const [current, setCurrent] = useState<DisplayMessage | null>(null)
  const currentRef = useRef<DisplayMessage | null>(null)
  const mascotTrackRef = useRef<MascotTrack>({ left: 0, top: 0, width: 0, height: 0 })
  const mascotXRef = useRef(0)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])

  const isSpeaking = current !== null

  const updateBubblePosition = useCallback(() => {
    if (!bubbleRef.current) return
    const track = mascotTrackRef.current
    const left = track.left + mascotXRef.current + MOLE_WIDTH / 2
    const top = track.top + track.height + 4
    bubbleRef.current.style.left = `${left}px`
    bubbleRef.current.style.top = `${top}px`
  }, [])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  const processNext = useCallback(() => {
    const next = queueRef.current.shift()
    if (!next) {
      setCurrent(null)
      return
    }

    setCurrent({ message: next, state: 'entering' })

    const duration = next.duration ?? DEFAULT_DURATIONS[next.type]

    const visibleTimer = window.setTimeout(() => {
      setCurrent(prev => {
        if (prev?.message !== next) return prev
        return { message: next, state: 'visible' }
      })

      if (duration > 0) {
        const exitTimer = window.setTimeout(() => {
          setCurrent(prev => {
            if (prev?.message !== next) return prev
            return { message: next, state: 'exiting' }
          })

          const removeTimer = window.setTimeout(() => {
            processNext()
          }, 250)
          timersRef.current.push(removeTimer)
        }, duration)
        timersRef.current.push(exitTimer)
      }
    }, 280)
    timersRef.current.push(visibleTimer)
  }, [])

  const speakBubble = useCallback((msg: MoleMessage) => {
    if (!msg.type || !msg.text) return
    queueRef.current.push(msg)

    const cur = currentRef.current
    if (!cur) {
      processNext()
    } else if (cur.state === 'visible' && (cur.message.duration ?? DEFAULT_DURATIONS[cur.message.type]) === 0) {
      clearTimers()
      setCurrent(prev => prev ? { ...prev, state: 'exiting' } : null)
      const removeTimer = window.setTimeout(() => {
        processNext()
      }, 250)
      timersRef.current.push(removeTimer)
    }
  }, [clearTimers, processNext])

  useEffect(() => {
    currentRef.current = current
    if (current) {
      // Use requestAnimationFrame to ensure the DOM is ready for the ref
      requestAnimationFrame(() => updateBubblePosition())
    }
  }, [current, updateBubblePosition])

  const setMascotTrack = useCallback((track: MascotTrack) => {
    mascotTrackRef.current = track
    updateBubblePosition()
  }, [updateBubblePosition])

  const setMascotX = useCallback((x: number) => {
    mascotXRef.current = x
    updateBubblePosition()
  }, [updateBubblePosition])

  const speakBubbleRef = useRef(speakBubble)
  speakBubbleRef.current = speakBubble

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof (window as any)?.runtime?.EventsOn !== 'function') return

    const unlisten = EventsOn(MOLE_SPEAK_WAILS_EVENT, (data: MoleSpeakDetail) => {
      if (data && data.type && data.text) {
        speakBubbleRef.current(data as MoleMessage)
      }
    })

    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  const bubbleTypeClass = current
    ? current.message.type === 'success'
      ? 'mole-bubble-success'
      : current.message.type === 'error'
        ? 'mole-bubble-error'
        : 'mole-bubble-info'
    : ''

  const tailTypeClass = current
    ? current.message.type === 'success'
      ? 'mole-tail-success'
      : current.message.type === 'error'
        ? 'mole-tail-error'
        : 'mole-tail-info'
    : ''

  const animClass = current
    ? current.state === 'entering'
      ? 'mole-bubble-entering'
      : current.state === 'exiting'
        ? 'mole-bubble-exiting'
        : ''
    : ''

  return (
    <MoleMessageContext.Provider value={{ speakBubble, isSpeaking, setMascotTrack, setMascotX }}>
      {children}
      <style>{BUBBLE_STYLES}</style>
      {current && createPortal(
        <div
          ref={bubbleRef}
          className="mole-speech-bubble-container"
          style={{
            position: 'fixed',
            left: '-9999px',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <div
            className={`mole-speech-bubble ${bubbleTypeClass} ${animClass}`}
          >
            <div className={`mole-speech-tail ${tailTypeClass}`} />
            <span>{current.message.text}</span>
          </div>
        </div>,
        document.body
      )}
    </MoleMessageContext.Provider>
  )
}