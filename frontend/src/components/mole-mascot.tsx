import { useEffect, useState, useRef } from 'react'

export function MoleMascot() {
  const [mode, setMode] = useState<'idle' | 'dig'>('idle')
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 6000
      timerRef.current = window.setTimeout(() => {
        if (Math.random() < 0.35) {
          setMode('dig')
          window.setTimeout(() => {
            setMode('idle')
            setDirection(d => d === 'left' ? 'right' : 'left')
            scheduleNext()
          }, 800 + Math.random() * 400)
        } else {
          setDirection(d => d === 'left' ? 'right' : 'left')
          scheduleNext()
        }
      }, delay)
    }

    scheduleNext()
    return () => window.clearTimeout(timerRef.current)
  }, [])

  const walkOffset = mode === 'idle'
    ? (direction === 'right' ? '3px' : '-3px')
    : '0px'

  return (
    <div
      className="relative flex h-7 items-end overflow-hidden"
      style={{ width: '40px' }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-x-0 bottom-0 h-2 rounded-full bg-[hsl(var(--selected))]/40"
      />
      <svg
        viewBox="0 0 88 54"
        className="relative h-6 text-primary transition-all duration-700 ease-in-out"
        style={{
          transform: `translateX(${walkOffset}) scaleX(${direction === 'left' ? -1 : 1})`,
          width: '32px',
        }}
        fill="none"
      >
        <ellipse cx="44" cy="42" rx="28" ry="8" fill="hsla(var(--primary),0.18)" />
        <path d="M23 42C25 31 33 23 44 23C55 23 63 31 65 42" fill="hsl(var(--card))" />
        <circle cx="36" cy="28" r="13" fill="currentColor" opacity="0.18" />
        <circle cx="51" cy="27" r="13" fill="currentColor" opacity="0.18" />
        <path
          d="M31 18C31 12.6 35.6 8 41 8H47C52.4 8 57 12.6 57 18V29C57 34.4 52.4 39 47 39H41C35.6 39 31 34.4 31 29V18Z"
          fill="currentColor"
          opacity="0.92"
        />
        <ellipse cx="44" cy="31.5" rx="7.5" ry="4.8" fill="hsl(var(--card))" />
        <circle cx="40" cy="21" r="1.8" fill="hsl(var(--background))" />
        <circle cx="48" cy="21" r="1.8" fill="hsl(var(--background))" />
        <path d="M44 25.5L42.6 28.2H45.4L44 25.5Z" fill="hsl(var(--background))" />
        <path d="M36 13L33 8L39 10.5" fill="currentColor" opacity="0.9" />
        <path d="M52 13L55 8L49 10.5" fill="currentColor" opacity="0.9" />
        <g
          className="origin-[56px_34px] transition-transform duration-500"
          style={{ transform: mode === 'dig' ? 'rotate(-18deg) translateX(1px) translateY(-1px)' : 'rotate(0deg)' }}
        >
          <path d="M55 33C61 31 68 30 73 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M73 34L78 23" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M76 19L84 22L79 27L72 24" fill="hsl(var(--selected))" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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
          <circle cx="69" cy="14" r="1.2" fill="hsl(var(--selected-foreground))" />
          <circle cx="73" cy="11" r="1.4" fill="hsl(var(--selected-foreground))" />
          <circle cx="76" cy="15" r="1.1" fill="hsl(var(--selected-foreground))" />
        </g>
      </svg>
    </div>
  )
}