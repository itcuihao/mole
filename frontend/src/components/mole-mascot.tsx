import { useEffect, useRef, useState } from 'react'
import { MOLE_OPEN_BURROW_EVENT, type MoleOpenBurrowDetail } from '@/lib/mascot-events'

type BurrowAnimState = 'none' | 'digging' | 'diving' | 'emerging'

export function MoleMascot() {
  const trackRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number>(0)
  const timersRef = useRef<number[]>([])
  const xRef = useRef(0)
  const lastTimeRef = useRef<number>(0)
  const lastDigAtRef = useRef<number>(0)
  const moveDirRef = useRef(1)
  const burrowAnimRef = useRef<BurrowAnimState>('none')
  const [mode, setMode] = useState<'idle' | 'dig'>('idle')
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [burrowAnim, setBurrowAnim] = useState<BurrowAnimState>('none')
  const [trackColor, setTrackColor] = useState<string | null>(null)
  const [x, setX] = useState(0)

  const clearTimers = () => {
    timersRef.current.forEach(id => window.clearTimeout(id))
    timersRef.current = []
  }

  const runOpenBurrowAnimation = () => {
    if (typeof window === 'undefined') return
    clearTimers()
    burrowAnimRef.current = 'digging'
    setBurrowAnim('digging')
    setMode('dig')

    const divingTimer = window.setTimeout(() => {
      burrowAnimRef.current = 'diving'
      setBurrowAnim('diving')
    }, 560)

    const emergeTimer = window.setTimeout(() => {
      xRef.current = 0
      setX(0)
      moveDirRef.current = 1
      setDirection('right')
      burrowAnimRef.current = 'emerging'
      setBurrowAnim('emerging')
    }, 980)

    const finishTimer = window.setTimeout(() => {
      burrowAnimRef.current = 'none'
      setBurrowAnim('none')
      setMode('idle')
      lastDigAtRef.current = performance.now()
    }, 1460)

    timersRef.current.push(divingTimer, emergeTimer, finishTimer)
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onOpenBurrow = (event: Event) => {
      const customEvent = event as CustomEvent<MoleOpenBurrowDetail>
      const nextColor = (customEvent.detail?.profileColor || '').trim()
      if (nextColor) {
        setTrackColor(nextColor)
      } else {
        setTrackColor(null)
      }
      runOpenBurrowAnimation()
    }
    window.addEventListener(MOLE_OPEN_BURROW_EVENT, onOpenBurrow)
    return () => {
      window.removeEventListener(MOLE_OPEN_BURROW_EVENT, onOpenBurrow)
      clearTimers()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const speed = 26 // px/s
    const mascotWidth = 48
    let digUntil = 0
    let nextDigAt = performance.now() + 3500 + Math.random() * 5500

    const step = (now: number) => {
      const track = trackRef.current
      if (!track) {
        frameRef.current = window.requestAnimationFrame(step)
        return
      }
      if (document.hidden) {
        lastTimeRef.current = now
        frameRef.current = window.requestAnimationFrame(step)
        return
      }

      if (!lastTimeRef.current) lastTimeRef.current = now
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = now

      const maxX = Math.max(track.clientWidth - mascotWidth, 0)
      let nextX = xRef.current

      if (burrowAnimRef.current !== 'none') {
        xRef.current = nextX
        setX(nextX)
        frameRef.current = window.requestAnimationFrame(step)
        return
      }

      if (now >= digUntil) {
        if (mode !== 'idle') setMode('idle')
        if (now >= nextDigAt && now - lastDigAtRef.current > 2400) {
          digUntil = now + 900 + Math.random() * 450
          lastDigAtRef.current = now
          nextDigAt = digUntil + 3600 + Math.random() * 6200
          setMode('dig')
        } else {
          nextX += moveDirRef.current * speed * dt
          if (nextX <= 0) {
            nextX = 0
            moveDirRef.current = 1
          } else if (nextX >= maxX) {
            nextX = maxX
            moveDirRef.current = -1
          }
        }
      }

      xRef.current = nextX
      setX(nextX)
      setDirection(moveDirRef.current === 1 ? 'right' : 'left')
      frameRef.current = window.requestAnimationFrame(step)
    }

    frameRef.current = window.requestAnimationFrame(step)
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const verticalTransform = burrowAnim === 'diving'
    ? 'translateY(16px) scale(0.82)'
    : burrowAnim === 'emerging'
      ? 'translateY(0px) scale(1)'
      : 'translateY(0px) scale(1)'

  const mascotOpacity = burrowAnim === 'diving' ? 0.15 : 1
  const handleTurnAround = () => {
    moveDirRef.current = moveDirRef.current === 1 ? -1 : 1
    setDirection(moveDirRef.current === 1 ? 'right' : 'left')
  }

  return (
      <div
        ref={trackRef}
      className="relative h-8 w-full cursor-pointer overflow-hidden"
      onClick={handleTurnAround}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 bottom-0 h-2.5 overflow-hidden rounded-full">
        <div
          className="absolute inset-0 transition-colors duration-500"
          style={{
            backgroundColor: trackColor || 'hsl(var(--selected))',
            opacity: 0.42,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.42,
            backgroundImage: [
              'radial-gradient(circle at 18% 35%, rgba(255,255,255,0.65) 0 0.8px, transparent 1.1px)',
              'radial-gradient(circle at 54% 72%, rgba(0,0,0,0.38) 0 0.85px, transparent 1.15px)',
              'radial-gradient(circle at 86% 28%, rgba(255,255,255,0.5) 0 0.7px, transparent 1px)',
              'radial-gradient(circle at 34% 62%, rgba(0,0,0,0.24) 0 0.65px, transparent 0.95px)',
            ].join(','),
            backgroundSize: '16px 8px, 14px 7px, 18px 9px, 12px 6px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.45,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), rgba(0,0,0,0.16))',
          }}
        />
      </div>
      <svg
        viewBox="0 0 88 54"
        className="absolute bottom-0 h-7 text-primary transition-[transform] duration-200 ease-linear"
        style={{
          left: `${x}px`,
          transform: `scaleX(${direction === 'left' ? -1 : 1}) ${verticalTransform}`,
          opacity: mascotOpacity,
          width: '48px',
        }}
        fill="none"
      >
        <ellipse cx="44" cy="42" rx="28" ry="8" fill="hsla(var(--primary),0.2)" />
        <path d="M23 42C25 31 33 23 44 23C55 23 63 31 65 42" fill="hsl(var(--card))" />
        <circle cx="36" cy="28" r="13" fill="currentColor" opacity="0.22" />
        <circle cx="51" cy="27" r="13" fill="currentColor" opacity="0.22" />
        <path
          d="M31 18C31 12.6 35.6 8 41 8H47C52.4 8 57 12.6 57 18V29C57 34.4 52.4 39 47 39H41C35.6 39 31 34.4 31 29V18Z"
          fill="currentColor"
          opacity="0.92"
        />
        <ellipse cx="44" cy="31.5" rx="8.4" ry="5.4" fill="#F6F7F9" />
        <circle cx="40" cy="21" r="1.8" fill="hsl(var(--background))" />
        <circle cx="48" cy="21" r="1.8" fill="hsl(var(--background))" />
        <circle cx="44" cy="25.8" r="1.8" fill="#E5484D" />
        <path d="M36 13L33 8L39 10.5" fill="currentColor" opacity="0.9" />
        <path d="M52 13L55 8L49 10.5" fill="currentColor" opacity="0.9" />
        <g
          className="origin-[56px_34px] transition-transform duration-500"
          style={{ transform: mode === 'dig' ? 'rotate(-18deg) translateX(1px) translateY(-1px)' : 'rotate(0deg)' }}
        >
          <path d="M55 33C60 31.5 64 31 67 33.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M67.5 33.2L71 25.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M69.3 23.2L76.8 24.6L73.8 31.6L66.2 30.1Z" fill="#D84B55" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </g>
        <g
          className="transition-transform duration-500"
          style={{ transform: mode === 'dig' ? 'translateY(-1px)' : 'translateY(0)' }}
        >
          <path d="M32 39C34 34 37 31 41 31" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M47 31C51 31 54 34 56 39" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g
          className="transition-opacity duration-500"
          style={{ opacity: mode === 'dig' ? 1 : 0, transform: mode === 'dig' ? 'translateX(2px) translateY(-1px)' : 'translateX(0) translateY(0)' }}
        >
          <circle cx="69" cy="14" r="1.2" fill="#F3B8BD" />
          <circle cx="73" cy="11" r="1.4" fill="#F3B8BD" />
          <circle cx="76" cy="15" r="1.1" fill="#F3B8BD" />
        </g>
      </svg>
    </div>
  )
}
