import { mapFont } from './fonts'
import type { Annotation, AnnotationType, DrawingStyle } from './types'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function typeLabel(type: AnnotationType): string {
  switch (type) {
    case 'rect':
      return 'Rectangle'
    case 'ellipse':
      return 'Ellipse'
    case 'line':
      return 'Ligne'
    case 'arrow':
      return 'Flèche'
    case 'text':
      return 'Texte'
  }
}

export function createAnnotation(
  type: AnnotationType,
  point: { x: number; y: number },
  style: DrawingStyle,
): Annotation {
  const base: Annotation = {
    id: uid(),
    type,
    x: Math.round(point.x),
    y: Math.round(point.y),
    w: 0,
    h: 0,
    stroke: style.stroke,
    fill: type === 'rect' || type === 'ellipse' ? style.fill : null,
    fillOpacity: style.fillOpacity,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    hidden: false,
  }

  if (type === 'text') {
    base.text = 'Nouveau texte'
    base.fontSize = 28
    base.fontFamily = style.fontFamily
    base.textAlign = 'left'
    base.w = estimatedTextWidth(base.text, base.fontSize, base.fontFamily)
    base.h = estimatedTextHeight(base.text, base.fontSize)
  }

  return base
}

export function annotationName(annotation: Annotation): string {
  if (annotation.type === 'text') {
    const content = annotation.text?.trim().replace(/\s+/g, ' ')
    return content ? (content.length > 26 ? `${content.slice(0, 26)}…` : content) : 'Texte vide'
  }
  return typeLabel(annotation.type)
}

export function layeredNames(annotations: Annotation[]): Map<string, string> {
  const counts = new Map<AnnotationType, number>()
  const names = new Map<string, string>()
  for (const annotation of annotations) {
    const count = (counts.get(annotation.type) ?? 0) + 1
    counts.set(annotation.type, count)
    names.set(annotation.id, `${annotationName(annotation)} ${String(count).padStart(2, '0')}`)
  }
  return names
}

export function isDarkColor(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return true
  const value = Number.parseInt(clean, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.5
}

export function textHalo(color: string): string {
  return isDarkColor(color) ? 'rgba(236, 232, 219, 0.72)' : 'rgba(8, 10, 8, 0.72)'
}

const widthCache = new Map<string, number>()
let measureContext: CanvasRenderingContext2D | null | undefined

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  return measureContext
}

export function estimatedTextWidth(text: string, fontSize: number, fontFamily?: string | null): number {
  const longestLine = text.split('\n').reduce(
    (longest, line) => (line.length > longest.length ? line : longest),
    '',
  )
  if (longestLine.length === 0) return 38

  const font = mapFont(fontFamily)
  const context = getMeasureContext()
  if (!context) return Math.max(38, longestLine.length * fontSize * 0.56)

  const spec = `${font.weight} ${fontSize}px ${font.stack}`
  const loaded =
    typeof document === 'undefined' ||
    !('fonts' in document) ||
    document.fonts.check(`${font.weight} ${fontSize}px "${font.family}"`)
  const key = `${spec}|${loaded ? 'ready' : 'fallback'}|${longestLine}`
  const cached = widthCache.get(key)
  if (cached !== undefined) return cached

  context.font = spec
  const width = Math.max(38, context.measureText(longestLine).width)
  if (widthCache.size > 500) widthCache.clear()
  widthCache.set(key, width)
  return width
}

export function estimatedTextHeight(text: string, fontSize: number): number {
  return Math.max(fontSize * 1.2, text.split('\n').length * fontSize * 1.25)
}

export function safeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export function formatDate(value: string | null): string {
  if (!value) return 'Jamais enregistré'
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
