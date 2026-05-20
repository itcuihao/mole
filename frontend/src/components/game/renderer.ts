import type { GameWorld, MoleCharacter, Obstacle, Particle, GameState, ThemeColors } from './types'

function getThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const hsl = (v: string) => `hsl(${v})`
  return {
    background: hsl(style.getPropertyValue('--background').trim()),
    foreground: hsl(style.getPropertyValue('--foreground').trim()),
    primary: hsl(style.getPropertyValue('--primary').trim()),
    card: hsl(style.getPropertyValue('--card').trim()),
    muted: hsl(style.getPropertyValue('--muted').trim()),
    mutedForeground: hsl(style.getPropertyValue('--muted-foreground').trim()),
    border: hsl(style.getPropertyValue('--border').trim()),
    accent: hsl(style.getPropertyValue('--accent').trim()),
  }
}

function hslWithAlpha(hslStr: string, alpha: number): string {
  return hslStr.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`)
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  world: GameWorld,
  mole: MoleCharacter,
  gameState: GameState,
  isDark: boolean,
): void {
  const colors = getThemeColors()
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  drawBackground(ctx, canvasWidth, canvasHeight, world, colors, isDark)
  drawGround(ctx, world, canvasWidth, canvasHeight, colors)
  drawObstacles(ctx, world.obstacles, colors)
  drawMole(ctx, mole, world.frameCount, colors, gameState)
  drawParticles(ctx, world.particles)
  drawScore(ctx, world, canvasWidth, colors)

  if (gameState === 'ready') {
    drawReadyOverlay(ctx, canvasWidth, canvasHeight, colors)
  } else if (gameState === 'gameOver') {
    drawGameOverOverlay(ctx, canvasWidth, canvasHeight, world, colors)
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: GameWorld,
  colors: ThemeColors,
  isDark: boolean,
): void {
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, w, h)

  const skyTop = isDark ? '#1a1a2e' : '#e8f0fe'
  const skyBottom = isDark ? '#2d2d44' : '#f0f4fa'
  const grad = ctx.createLinearGradient(0, 0, 0, world.groundY)
  grad.addColorStop(0, skyTop)
  grad.addColorStop(1, skyBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, world.groundY)

  // Sun or moon
  const sunX = w * 0.82
  const sunY = h * 0.13
  ctx.fillStyle = isDark ? 'rgba(255,255,220,0.3)' : 'rgba(255,200,100,0.25)'
  ctx.beginPath()
  ctx.arc(sunX, sunY, 38, 0, Math.PI * 2)
  ctx.fill()

  // Clouds
  drawClouds(ctx, w, world.groundY, world.frameCount, isDark)

  // Distant mountains
  drawMountains(ctx, w, world.groundY, world.frameCount, world.scrollSpeed, colors, isDark)
}

function drawClouds(ctx: CanvasRenderingContext2D, w: number, groundY: number, frame: number, isDark: boolean): void {
  const cloudColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)'
  ctx.fillStyle = cloudColor
  const cloudPositions = [
    { x: 0.1, y: 0.08, s: 1.0 },
    { x: 0.4, y: 0.14, s: 0.75 },
    { x: 0.7, y: 0.06, s: 1.2 },
    { x: 0.9, y: 0.18, s: 0.6 },
  ]
  for (const cp of cloudPositions) {
    const bx = (cp.x * w + frame * 0.08) % (w + 200) - 100
    const by = cp.y * groundY
    const s = cp.s
    ctx.beginPath()
    ctx.ellipse(bx, by, 50 * s, 16 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(bx + 25 * s, by - 8 * s, 35 * s, 14 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(bx - 20 * s, by + 2 * s, 30 * s, 12 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  frame: number,
  speed: number,
  colors: ThemeColors,
  isDark: boolean,
): void {
  const color = isDark ? 'rgba(60,60,80,0.3)' : hslWithAlpha(colors.muted, 0.4)
  ctx.fillStyle = color
  const offset = (frame * speed * 0.03) % 600

  const peaks = [0.15, 0.35, 0.55, 0.75, 0.95]
  for (const peak of peaks) {
    const px = peak * w * 1.8 - offset + 100
    const ph = 40 + ((peak * 7) % 1) * 35
    ctx.beginPath()
    ctx.moveTo(px - 80, groundY)
    ctx.lineTo(px, groundY - ph)
    ctx.lineTo(px + 80, groundY)
    ctx.closePath()
    ctx.fill()
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  canvasWidth: number,
  canvasHeight: number,
  colors: ThemeColors,
): void {
  const gY = world.groundY
  const isDark = document.documentElement.classList.contains('dark')

  // Ground fill
  ctx.fillStyle = isDark ? '#3a3028' : '#d4c4a8'
  ctx.fillRect(0, gY, canvasWidth, canvasHeight - gY)

  // Surface line
  ctx.strokeStyle = isDark ? '#5a4a38' : '#8b7355'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, gY)
  for (let x = 0; x <= canvasWidth; x += 4) {
    let totalBump = 0
    for (const seg of world.groundSegments) {
      if (x >= seg.x && x < seg.x + seg.width) {
        const idx = Math.floor(((x - seg.x) / seg.width) * seg.bumps.length)
        totalBump = seg.bumps[idx] || 0
        break
      }
    }
    ctx.lineTo(x, gY - totalBump)
  }
  ctx.stroke()

  // Grass tufts
  const grassOffset = world.frameCount * world.scrollSpeed * 0.03
  ctx.strokeStyle = isDark ? '#5a6a3a' : '#7a9a4a'
  ctx.lineWidth = 1.5
  for (let x = -grassOffset % 60; x < canvasWidth; x += 60) {
    const sx = x + Math.sin(x * 0.1) * 8
    ctx.beginPath()
    ctx.moveTo(sx, gY - 1)
    ctx.lineTo(sx - 3, gY - 7 - Math.random() * 3)
    ctx.moveTo(sx, gY - 1)
    ctx.lineTo(sx + 2, gY - 6 - Math.random() * 3)
    ctx.stroke()
  }
}

function drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[], colors: ThemeColors): void {
  const isDark = document.documentElement.classList.contains('dark')

  for (const obs of obstacles) {
    switch (obs.type) {
      case 'molehill':
        drawMolehill(ctx, obs, isDark)
        break
      case 'shovel':
        drawShovel(ctx, obs, colors, isDark)
        break
      case 'worm':
        drawWorm(ctx, obs, colors, isDark)
        break
    }
  }
}

function drawMolehill(ctx: CanvasRenderingContext2D, obs: Obstacle, isDark: boolean): void {
  const cx = obs.x + obs.width / 2
  const baseY = obs.y + obs.height
  const fillColor = isDark ? '#5a4030' : '#8b6914'
  const highlightColor = isDark ? '#6b5040' : '#a0792a'

  ctx.fillStyle = fillColor
  ctx.beginPath()
  ctx.ellipse(cx, baseY, obs.width / 2, obs.height, 0, Math.PI, 0)
  ctx.fill()

  // Dirt texture
  ctx.fillStyle = highlightColor
  for (let i = 0; i < 4 + obs.variant; i++) {
    const dx = cx - obs.width * 0.25 + Math.random() * obs.width * 0.5
    const dy = baseY - obs.height * 0.3 - Math.random() * obs.height * 0.5
    ctx.beginPath()
    ctx.arc(dx, dy, 2 + Math.random() * 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Small hole/dot at top
  ctx.fillStyle = isDark ? '#2a1a10' : '#3a2510'
  ctx.beginPath()
  ctx.arc(cx, baseY - obs.height + 4, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawShovel(ctx: CanvasRenderingContext2D, obs: Obstacle, colors: ThemeColors, isDark: boolean): void {
  const bladeW = obs.width
  const bladeH = 14
  const shaftW = 3
  const shaftH = obs.height - bladeH + 8
  const cx = obs.x + bladeW / 2
  const topY = obs.y

  // Shaft
  ctx.fillStyle = isDark ? '#8a7a6a' : '#c4a882'
  ctx.fillRect(cx - shaftW / 2, topY, shaftW, shaftH)

  // Blade
  const bladeTop = topY + shaftH
  ctx.fillStyle = isDark ? '#7a7a7a' : '#9a9a9a'
  ctx.beginPath()
  ctx.moveTo(cx - bladeW / 2, bladeTop)
  ctx.lineTo(cx + bladeW / 2, bladeTop)
  ctx.quadraticCurveTo(cx + bladeW / 2 + 2, bladeTop + bladeH, cx + 2, bladeTop + bladeH)
  ctx.quadraticCurveTo(cx, bladeTop + bladeH - 2, cx - 2, bladeTop + bladeH)
  ctx.quadraticCurveTo(cx - bladeW / 2 - 2, bladeTop + bladeH, cx - bladeW / 2, bladeTop)
  ctx.fill()
}

function drawWorm(ctx: CanvasRenderingContext2D, obs: Obstacle, colors: ThemeColors, isDark: boolean): void {
  const baseY = obs.y + obs.height - 2
  const w = obs.width
  const color = isDark ? '#c4956a' : '#e8b88a'

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  const segments = 10
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const sx = obs.x + t * w
    const sy = baseY + Math.sin(t * Math.PI * 2.5) * 4
    if (i === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  ctx.stroke()

  // Eye
  ctx.fillStyle = isDark ? '#ffffff' : '#333333'
  ctx.beginPath()
  ctx.arc(obs.x + 5, baseY - 6, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = isDark ? '#333333' : '#ffffff'
  ctx.beginPath()
  ctx.arc(obs.x + 5.5, baseY - 6.5, 1, 0, Math.PI * 2)
  ctx.fill()
}

// Mole SVG cache — keyed by theme + variant
const moleImageCache = new Map<string, HTMLImageElement>()

function resolveSVGColors(svg: string, primary: string, card: string, background: string): string {
  return svg
    .replace(/currentColor/g, primary)
    .replace(/hsl\(var\(--primary\)\s*,\s*0\.2\)/g, hslWithAlpha(primary, 0.2))
    .replace(/hsl\(var\(--primary\)\)/g, primary)
    .replace(/hsl\(var\(--card\)\)/g, card)
    .replace(/hsl\(var\(--background\)\)/g, background)
}

function buildMoleSVG(primary: string, card: string, background: string, variant: 'run0' | 'run1' | 'jump'): string {
  const legLeft = variant === 'jump'
    ? 'M32 39C34 36 37 34 41 33'
    : variant === 'run1'
      ? 'M32 39C35 34 38 32 42 30'
      : 'M32 39C34 34 37 31 41 31'
  const legRight = variant === 'jump'
    ? 'M47 33C51 34 54 36 56 39'
    : variant === 'run1'
      ? 'M46 30C50 32 53 34 55 39'
      : 'M47 31C51 31 54 34 56 39'

  const armTransform = variant === 'jump'
    ? 'rotate(-25deg) translateX(1px) translateY(-2px)'
    : variant === 'run1'
      ? 'rotate(-10deg) translateX(1px) translateY(-1px)'
      : 'rotate(0deg)'

  const legTransform = variant === 'jump'
    ? 'translateY(-3px)'
    : 'translateY(0)'

  const svg = `<svg viewBox="0 0 88 54" width="96" height="59" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="44" cy="42" rx="28" ry="8" fill="hsla(var(--primary),0.2)"/>
    <path d="M23 42C25 31 33 23 44 23C55 23 63 31 65 42" fill="hsl(var(--card))"/>
    <circle cx="36" cy="28" r="13" fill="currentColor" opacity="0.22"/>
    <circle cx="51" cy="27" r="13" fill="currentColor" opacity="0.22"/>
    <path d="M31 18C31 12.6 35.6 8 41 8H47C52.4 8 57 12.6 57 18V29C57 34.4 52.4 39 47 39H41C35.6 39 31 34.4 31 29V18Z" fill="currentColor" opacity="0.92"/>
    <ellipse cx="44" cy="31.5" rx="8.4" ry="5.4" fill="#F6F7F9"/>
    <circle cx="40" cy="21" r="1.8" fill="hsl(var(--background))"/>
    <circle cx="48" cy="21" r="1.8" fill="hsl(var(--background))"/>
    <circle cx="44" cy="25.8" r="1.8" fill="#E5484D"/>
    <path d="M36 13L33 8L39 10.5" fill="currentColor" opacity="0.9"/>
    <path d="M52 13L55 8L49 10.5" fill="currentColor" opacity="0.9"/>
    <g transform="${armTransform}" style="transform-origin:56px 34px">
      <path d="M55 33C60 31.5 64 31 67 33.5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <path d="M67.5 33.2L71 25.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M69.3 23.2L76.8 24.6L73.8 31.6L66.2 30.1Z" fill="#D84B55" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </g>
    <g transform="${legTransform}">
      <path d="${legLeft}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <path d="${legRight}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    </g>
  </svg>`

  return resolveSVGColors(svg, primary, card, background)
}

function getMoleImage(primary: string, card: string, background: string, variant: 'run0' | 'run1' | 'jump'): HTMLImageElement | null {
  const key = `${primary}|${card}|${background}|${variant}`
  const cached = moleImageCache.get(key)
  if (cached) return cached

  const svg = buildMoleSVG(primary, card, background, variant)
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`
  const img = new Image()
  img.src = dataUrl
  moleImageCache.set(key, img)
  return img
}

function drawMole(
  ctx: CanvasRenderingContext2D,
  mole: MoleCharacter,
  frameCount: number,
  colors: ThemeColors,
  gameState: GameState,
): void {
  const { x, y } = mole
  const isDark = document.documentElement.classList.contains('dark')
  const cardColor = isDark ? 'hsl(223,30%,16%)' : 'hsl(0,0%,100%)'
  const bgColor = isDark ? 'hsl(224,42%,9%)' : 'hsl(210,33%,98%)'

  const variant: 'run0' | 'run1' | 'jump' = mole.isJumping
    ? 'jump'
    : Math.floor(mole.legFrame / 6) % 2 === 0
      ? 'run0'
      : 'run1'

  const img = getMoleImage(colors.primary, cardColor, bgColor, variant)
  if (!img) return

  ctx.save()
  if (gameState === 'gameOver') {
    ctx.globalAlpha = 0.4
  }
  // Image is 96x59 (2x scale of viewBox 48x29.5), draw at ~48x30
  ctx.drawImage(img, x - 24, y - 6, 96, 59)
  ctx.restore()
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba')
    if (p.color.startsWith('#')) {
      const r = parseInt(p.color.slice(1, 3), 16)
      const g = parseInt(p.color.slice(3, 5), 16)
      const b = parseInt(p.color.slice(5, 7), 16)
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    }
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  canvasWidth: number,
  colors: ThemeColors,
): void {
  ctx.fillStyle = colors.foreground
  ctx.font = 'bold 20px "JetBrains Mono", monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`${Math.floor(world.score)}`, canvasWidth - 24, 70)

  if (world.highScore > 0) {
    ctx.fillStyle = hslWithAlpha(colors.mutedForeground, 0.7)
    ctx.font = '12px "JetBrains Mono", monospace'
    ctx.fillText(`HI ${world.highScore}`, canvasWidth - 24, 88)
  }
}

function drawReadyOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: ThemeColors,
): void {
  ctx.fillStyle = colors.foreground
  ctx.font = 'bold 18px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Press Space or Click to Start', w / 2, h * 0.4)

  ctx.fillStyle = hslWithAlpha(colors.mutedForeground, 0.6)
  ctx.font = '13px "JetBrains Mono", monospace'
  ctx.fillText('ESC to exit', w / 2, h * 0.4 + 28)
}

function drawGameOverOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: GameWorld,
  colors: ThemeColors,
): void {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = colors.foreground
  ctx.font = 'bold 28px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', w / 2, h * 0.38)

  ctx.font = '16px "JetBrains Mono", monospace'
  ctx.fillText(`Score: ${Math.floor(world.score)}`, w / 2, h * 0.38 + 36)

  if (Math.floor(world.score) >= world.highScore && world.highScore > 0) {
    ctx.fillStyle = '#E5484D'
    ctx.font = 'bold 14px "JetBrains Mono", monospace'
    ctx.fillText('NEW HIGH SCORE!', w / 2, h * 0.38 + 60)
  }

  ctx.fillStyle = hslWithAlpha(colors.mutedForeground, 0.8)
  ctx.font = '14px "JetBrains Mono", monospace'
  ctx.fillText('Press Space or Click to Restart', w / 2, h * 0.38 + 90)
  ctx.fillText('ESC to exit', w / 2, h * 0.38 + 114)
}