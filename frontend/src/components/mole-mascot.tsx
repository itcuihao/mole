import { useEffect, useState } from 'react'

type MoleMascotProps = {
  actionToken?: number
}

export function MoleMascot({ actionToken = 0 }: MoleMascotProps) {
  const [mode, setMode] = useState<'idle' | 'dig'>('idle')

  useEffect(() => {
    if (!actionToken) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    setMode('dig')
    const timer = window.setTimeout(() => setMode('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [actionToken])

  return (
    <div
      className="relative flex h-9 w-14 items-end justify-center overflow-hidden rounded-full border border-border/70 bg-muted/45 px-2 shadow-sm"
      aria-hidden="true"
    >
      <div className="absolute inset-x-1 bottom-1 h-3 rounded-full bg-[hsl(var(--selected))]" />
      <svg
        viewBox="0 0 88 54"
        className={`relative h-8 w-12 text-primary transition-transform duration-500 ${mode === 'dig' ? 'translate-y-[1px]' : ''}`}
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
        <g className={`origin-[56px_34px] transition-transform duration-500 ${mode === 'dig' ? '-rotate-18 translate-x-1 -translate-y-1' : 'rotate-0'}`}>
          <path d="M55 33C61 31 68 30 73 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M73 34L78 23" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M76 19L84 22L79 27L72 24" fill="hsl(var(--selected))" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <g className={`transition-transform duration-500 ${mode === 'dig' ? '-translate-y-1' : ''}`}>
          <path d="M32 39C34 34 37 31 41 31" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M47 31C51 31 54 34 56 39" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g className={`transition-transform duration-500 ${mode === 'dig' ? 'translate-x-2 -translate-y-1 opacity-100' : 'opacity-0'}`}>
          <circle cx="69" cy="14" r="1.2" fill="hsl(var(--selected-foreground))" />
          <circle cx="73" cy="11" r="1.4" fill="hsl(var(--selected-foreground))" />
          <circle cx="76" cy="15" r="1.1" fill="hsl(var(--selected-foreground))" />
        </g>
      </svg>
    </div>
  )
}
