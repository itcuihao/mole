export type GameState = 'ready' | 'playing' | 'gameOver'

export interface GameEntity {
  x: number
  y: number
  width: number
  height: number
}

export interface MoleCharacter extends GameEntity {
  vy: number
  isJumping: boolean
  legFrame: number
}

export interface Obstacle extends GameEntity {
  type: 'molehill' | 'shovel' | 'worm'
  variant: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface GroundSegment {
  x: number
  width: number
  bumps: number[]
}

export interface GameWorld {
  groundY: number
  scrollSpeed: number
  score: number
  highScore: number
  frameCount: number
  obstacles: Obstacle[]
  particles: Particle[]
  groundSegments: GroundSegment[]
  lastObstacleSpawn: number
}

export interface GameInput {
  jump: boolean
}

export interface ThemeColors {
  background: string
  foreground: string
  primary: string
  card: string
  muted: string
  mutedForeground: string
  border: string
  accent: string
}