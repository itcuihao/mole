import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { createInitialWorld, createMole, updateGame, startGame } from './game-engine'
import { render } from './renderer'
import type { GameWorld, MoleCharacter, GameState } from './types'

interface MoleRunnerGameProps {
  onClose: () => void
}

export function MoleRunnerGame({ onClose }: MoleRunnerGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<GameWorld | null>(null)
  const moleRef = useRef<MoleCharacter | null>(null)
  const gameStateRef = useRef<GameState>('ready')
  const keysRef = useRef<Set<string>>(new Set())
  const clickRef = useRef(false)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)
  const [gameState, setGameState] = useState<GameState>('ready')
  const [isDark, setIsDark] = useState(false)

  // Detect theme
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const beginGame = useCallback(() => {
    if (!worldRef.current || !moleRef.current || !canvasRef.current) return
    startGame(worldRef.current, moleRef.current, canvasRef.current.width)
    gameStateRef.current = 'playing'
    setGameState('playing')
    lastTimeRef.current = 0
  }, [])

  const resizeCanvas = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Recreate world with new dimensions in CSS pixels
    worldRef.current = createInitialWorld(w, h)
    moleRef.current = createMole(w, worldRef.current.groundY)
  }, [])

  const gameLoop = useCallback((time: number) => {
    const world = worldRef.current
    const mole = moleRef.current
    const canvas = canvasRef.current
    if (!world || !mole || !canvas) {
      rafRef.current = requestAnimationFrame(gameLoop)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      rafRef.current = requestAnimationFrame(gameLoop)
      return
    }

    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight

    if (lastTimeRef.current === 0) lastTimeRef.current = time
    const rawDt = (time - lastTimeRef.current) / 1000
    lastTimeRef.current = time
    const dt = Math.min(rawDt, 0.1)

    if (document.hidden) {
      rafRef.current = requestAnimationFrame(gameLoop)
      return
    }

    const state = gameStateRef.current

    if (state === 'playing') {
      const input = { jump: keysRef.current.has('Space') || keysRef.current.has('ArrowUp') || clickRef.current }
      const result = updateGame(world, mole, input, dt, cssW)
      if (result === 'gameOver') {
        gameStateRef.current = 'gameOver'
        setGameState('gameOver')
      }
      clickRef.current = false
    }

    render(ctx, cssW, cssH, world, mole, state, isDark)
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [isDark])

  // Setup
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    resizeCanvas()

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })
    resizeObserver.observe(container)

    rafRef.current = requestAnimationFrame(gameLoop)

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [gameLoop, resizeCanvas])

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
      }
      keysRef.current.add(e.code)

      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (gameStateRef.current === 'ready') beginGame()
        else if (gameStateRef.current === 'gameOver') beginGame()
      }

      if (e.code === 'Escape') onClose()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [onClose, beginGame])

  // Click / touch
  const handlePointerDown = useCallback(() => {
    clickRef.current = true
    if (gameStateRef.current === 'ready') beginGame()
    else if (gameStateRef.current === 'gameOver') beginGame()
  }, [beginGame])

  return (
    <div className="fixed inset-0 z-[200] bg-background select-none" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-pointer"
        onMouseDown={handlePointerDown}
        onTouchStart={(e) => { e.preventDefault(); handlePointerDown() }}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
        aria-label="Close game"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}