import type { GameWorld, MoleCharacter, Obstacle, Particle, GameInput } from './types'

const GRAVITY = 1800
const JUMP_VELOCITY = -550
const MOLE_WIDTH = 48
const MOLE_HEIGHT = 36
const MOLE_X_RATIO = 0.15
const GROUND_Y_RATIO = 0.82

const BASE_SPEED = 300
const MAX_SPEED = 700
const SPEED_INCREASE = 2
const SCORE_RATE = 10

const MIN_SPAWN_INTERVAL = 0.7
const MAX_SPAWN_EXTRA = 0.7
const INITIAL_MIN_SPAWN = 1.8
const INITIAL_MAX_SPAWN = 2.8

const HIGH_SCORE_KEY = 'mole-runner-highscore'

function loadHighScore(): number {
  try {
    const v = localStorage.getItem(HIGH_SCORE_KEY)
    return v ? parseInt(v, 10) || 0 : 0
  } catch {
    return 0
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch { /* noop */ }
}

export function createInitialWorld(canvasWidth: number, canvasHeight: number): GameWorld {
  const groundY = canvasHeight * GROUND_Y_RATIO
  const segmentWidth = 200
  const segments = []
  for (let x = 0; x < canvasWidth + segmentWidth; x += segmentWidth) {
    segments.push({ x, width: segmentWidth, bumps: generateBumps() })
  }
  return {
    groundY,
    scrollSpeed: BASE_SPEED,
    score: 0,
    highScore: loadHighScore(),
    frameCount: 0,
    obstacles: [],
    particles: [],
    groundSegments: segments,
    lastObstacleSpawn: 0,
  }
}

function generateBumps(): number[] {
  const bumps: number[] = []
  for (let i = 0; i < 6; i++) {
    bumps.push(Math.random() < 0.35 ? Math.random() * 4 + 1 : 0)
  }
  return bumps
}

export function createMole(canvasWidth: number, groundY: number): MoleCharacter {
  return {
    x: canvasWidth * MOLE_X_RATIO,
    y: groundY - MOLE_HEIGHT,
    width: MOLE_WIDTH,
    height: MOLE_HEIGHT,
    vy: 0,
    isJumping: false,
    legFrame: 0,
  }
}

export function updateGame(
  world: GameWorld,
  mole: MoleCharacter,
  input: GameInput,
  dt: number,
  canvasWidth: number,
): 'playing' | 'gameOver' {
  world.frameCount++
  world.scrollSpeed = Math.min(BASE_SPEED + world.score * SPEED_INCREASE / SCORE_RATE, MAX_SPEED)
  world.score += dt * SCORE_RATE

  updateMolePhysics(mole, input, dt, world.groundY)
  updateObstacles(world, dt, canvasWidth)
  updateParticles(world, dt)
  updateGround(world, dt, canvasWidth)

  if (checkCollision(mole, world.obstacles)) {
    if (world.score > world.highScore) {
      world.highScore = Math.floor(world.score)
      saveHighScore(world.highScore)
    }
    spawnDeathParticles(world, mole)
    return 'gameOver'
  }

  return 'playing'
}

function updateMolePhysics(mole: MoleCharacter, input: GameInput, dt: number, groundY: number): void {
  if (input.jump && !mole.isJumping) {
    mole.vy = JUMP_VELOCITY
    mole.isJumping = true
  }

  mole.vy += GRAVITY * dt
  mole.y += mole.vy * dt

  if (mole.y >= groundY - mole.height) {
    mole.y = groundY - mole.height
    mole.vy = 0
    mole.isJumping = false
  }

  if (mole.isJumping) {
    mole.legFrame = 0
  } else {
    mole.legFrame = (mole.legFrame + 1) % 12
  }
}

function updateObstacles(world: GameWorld, dt: number, canvasWidth: number): void {
  for (const obs of world.obstacles) {
    obs.x -= world.scrollSpeed * dt
  }
  world.obstacles = world.obstacles.filter(o => o.x + o.width > -60)

  world.lastObstacleSpawn += dt
  const speedRatio = (world.scrollSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)
  const minInterval = INITIAL_MIN_SPAWN - (INITIAL_MIN_SPAWN - MIN_SPAWN_INTERVAL) * speedRatio
  const maxInterval = INITIAL_MAX_SPAWN - (INITIAL_MAX_SPAWN - (MIN_SPAWN_INTERVAL + MAX_SPAWN_EXTRA)) * speedRatio
  const nextSpawn = minInterval + Math.random() * (maxInterval - minInterval)

  if (world.lastObstacleSpawn >= nextSpawn) {
    world.obstacles.push(spawnObstacle(canvasWidth, world.groundY))
    world.lastObstacleSpawn = 0
  }
}

function spawnObstacle(canvasWidth: number, groundY: number): Obstacle {
  const types: Obstacle['type'][] = ['molehill', 'molehill', 'molehill', 'shovel', 'shovel', 'worm']
  const type = types[Math.floor(Math.random() * types.length)]
  const variant = Math.floor(Math.random() * 3)

  let width: number
  let height: number

  switch (type) {
    case 'molehill':
      width = 28 + variant * 10
      height = 16 + variant * 6
      break
    case 'shovel':
      width = 10
      height = 44 + variant * 6
      break
    case 'worm':
      width = 32 + variant * 8
      height = 10
      break
  }

  return {
    x: canvasWidth + Math.random() * 80,
    y: groundY - height,
    width,
    height,
    type,
    variant,
  }
}

function updateParticles(world: GameWorld, dt: number): void {
  for (const p of world.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 400 * dt
    p.life -= dt
  }
  world.particles = world.particles.filter(p => p.life > 0)
}

function updateGround(world: GameWorld, dt: number, canvasWidth: number): void {
  for (const seg of world.groundSegments) {
    seg.x -= world.scrollSpeed * dt
  }
  while (world.groundSegments.length > 0 && world.groundSegments[0].x + world.groundSegments[0].width < -20) {
    world.groundSegments.shift()
  }
  const last = world.groundSegments[world.groundSegments.length - 1]
  if (last && last.x + last.width < canvasWidth + last.width) {
    world.groundSegments.push({
      x: last.x + last.width,
      width: last.width,
      bumps: generateBumps(),
    })
  }
}

function checkCollision(mole: MoleCharacter, obstacles: Obstacle[]): boolean {
  const insetX = mole.width * 0.15
  const insetY = mole.height * 0.1
  const mx = mole.x + insetX
  const my = mole.y + insetY
  const mw = mole.width - insetX * 2
  const mh = mole.height - insetY * 2

  for (const obs of obstacles) {
    const ox = obs.x + 2
    const oy = obs.y + 2
    const ow = obs.width - 4
    const oh = obs.height - 4
    if (mx < ox + ow && mx + mw > ox && my < oy + oh && my + mh > oy) {
      return true
    }
  }
  return false
}

function spawnDeathParticles(world: GameWorld, mole: MoleCharacter): void {
  const cx = mole.x + mole.width / 2
  const cy = mole.y + mole.height / 2
  const colors = ['#E5484D', '#F3B8BD', '#D84B55', '#FF8C94']
  for (let i = 0; i < 12; i++) {
    world.particles.push({
      x: cx,
      y: cy,
      vx: (Math.random() - 0.5) * 200,
      vy: -Math.random() * 250 - 50,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
}

export function startGame(world: GameWorld, mole: MoleCharacter, canvasWidth: number): void {
  world.score = 0
  world.scrollSpeed = BASE_SPEED
  world.obstacles = []
  world.particles = []
  world.lastObstacleSpawn = 0
  world.frameCount = 0
  world.highScore = loadHighScore()
  world.groundSegments = []
  const segmentWidth = 200
  for (let x = 0; x < canvasWidth + segmentWidth; x += segmentWidth) {
    world.groundSegments.push({ x, width: segmentWidth, bumps: generateBumps() })
  }

  const groundY = world.groundY
  mole.x = canvasWidth * MOLE_X_RATIO
  mole.y = groundY - mole.height
  mole.vy = 0
  mole.isJumping = false
  mole.legFrame = 0
}