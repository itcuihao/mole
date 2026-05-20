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
  // Solid theme fill base
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, w, h)

  // Underground dirt gradient
  const dirtTop = isDark ? '#3a3028' : '#c4a87c'
  const dirtBottom = isDark ? '#2a2018' : '#8b7355'
  const grad = ctx.createLinearGradient(0, 0, 0, world.groundY)
  grad.addColorStop(0, dirtTop)
  grad.addColorStop(1, dirtBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, world.groundY)

  // Hanging roots from ceiling
  drawRoots(ctx, w, world.groundY, world.frameCount, world.scrollSpeed, isDark)

  // Rock/pebble texture
  drawRocks(ctx, w, world.groundY, world.frameCount, world.scrollSpeed, isDark)
}

function drawRoots(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  frame: number,
  speed: number,
  isDark: boolean,
): void {
  const rootColor = isDark ? 'rgba(80,60,40,0.25)' : 'rgba(100,70,40,0.18)'
  const parallaxFactor = speed * 0.015

  const roots = [
    { x: w * 0.08, length: groundY * 0.22, thickness: 1.8, sway: 0.4 },
    { x: w * 0.25, length: groundY * 0.32, thickness: 2.2, sway: 0.55 },
    { x: w * 0.48, length: groundY * 0.18, thickness: 1.4, sway: 0.3 },
    { x: w * 0.7, length: groundY * 0.28, thickness: 2.0, sway: 0.5 },
    { x: w * 0.88, length: groundY * 0.24, thickness: 1.6, sway: 0.35 },
  ]

  ctx.strokeStyle = rootColor
  ctx.lineCap = 'round'

  for (const root of roots) {
    const bx = ((root.x + frame * parallaxFactor * 0.3) % (w + 100)) - 50
    const tl = root.length
    ctx.lineWidth = root.thickness

    ctx.beginPath()
    ctx.moveTo(bx, 0)
    ctx.bezierCurveTo(
      bx + root.sway * 15, tl * 0.35,
      bx - root.sway * 12, tl * 0.65,
      bx + root.sway * 6, tl,
    )
    ctx.stroke()

    // Small branch off the main root
    if (root.length > groundY * 0.22) {
      ctx.lineWidth = root.thickness * 0.5
      const branchY = tl * 0.45
      ctx.beginPath()
      ctx.moveTo(bx + root.sway * 8, branchY)
      ctx.bezierCurveTo(
        bx + root.sway * 18, branchY + tl * 0.12,
        bx + root.sway * 22, branchY + tl * 0.18,
        bx + root.sway * 14, branchY + tl * 0.2,
      )
      ctx.stroke()
    }
  }
}

function drawRocks(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  frame: number,
  speed: number,
  isDark: boolean,
): void {
  const fillColor = isDark ? 'rgba(90,75,55,0.2)' : 'rgba(130,105,75,0.15)'
  const outlineColor = isDark ? 'rgba(70,55,40,0.12)' : 'rgba(110,85,60,0.1)'
  const parallaxFactor = speed * 0.025

  const rocks = [
    { x: w * 0.05, y: groundY * 0.72, r: 5, ry: 4 },
    { x: w * 0.18, y: groundY * 0.58, r: 3.5, ry: 3 },
    { x: w * 0.3, y: groundY * 0.78, r: 4.5, ry: 3.5 },
    { x: w * 0.42, y: groundY * 0.52, r: 6, ry: 4.5 },
    { x: w * 0.55, y: groundY * 0.7, r: 3, ry: 2.5 },
    { x: w * 0.68, y: groundY * 0.6, r: 5.5, ry: 4 },
    { x: w * 0.8, y: groundY * 0.75, r: 4, ry: 3 },
    { x: w * 0.92, y: groundY * 0.55, r: 3.5, ry: 2.5 },
    { x: w * 0.12, y: groundY * 0.88, r: 2.5, ry: 2 },
    { x: w * 0.62, y: groundY * 0.85, r: 3, ry: 2.5 },
    { x: w * 0.35, y: groundY * 0.92, r: 2, ry: 1.5 },
    { x: w * 0.85, y: groundY * 0.9, r: 2.5, ry: 2 },
  ]

  for (const rock of rocks) {
    const rx = ((rock.x + frame * parallaxFactor * 0.2) % (w + 60)) - 30
    const ry = rock.y

    // Fill
    ctx.fillStyle = fillColor
    ctx.beginPath()
    ctx.ellipse(rx, ry, rock.r, rock.ry, 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Subtle outline
    ctx.strokeStyle = outlineColor
    ctx.lineWidth = 0.8
    ctx.stroke()
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