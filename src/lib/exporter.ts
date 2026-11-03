import type { Annotation, MapSummary } from './types'
import { estimatedTextWidth, isDarkColor, safeFileName, textHalo } from './annotations'
import { ensureFontsLoaded, mapFont, type MapFont } from './fonts'

const MAX_PIXELS = 80_000_000

interface ExportOptions {
  map: MapSummary
  annotations: Annotation[]
  includeMap: boolean
}

export interface PngExportResult {
  blob: Blob
  width: number
  height: number
  scale: number
  widthCm: number
  heightCm: number
}

function visibleAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => !annotation.hidden)
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de charger l’image de fond.'))
    image.src = source
  })
}

function normalizeBox(annotation: Annotation) {
  return {
    x: Math.min(annotation.x, annotation.x + annotation.w),
    y: Math.min(annotation.y, annotation.y + annotation.h),
    w: Math.abs(annotation.w),
    h: Math.abs(annotation.h),
  }
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  strokeWidth: number,
  color: string,
) {
  const length = Math.max(9, strokeWidth * 3.8)
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const wing = length * 0.56
  const baseX = toX - Math.cos(angle) * length
  const baseY = toY - Math.sin(angle) * length
  context.save()
  context.fillStyle = color
  context.beginPath()
  context.moveTo(toX, toY)
  context.lineTo(baseX + Math.cos(angle + Math.PI / 2) * wing, baseY + Math.sin(angle + Math.PI / 2) * wing)
  context.lineTo(baseX + Math.cos(angle - Math.PI / 2) * wing, baseY + Math.sin(angle - Math.PI / 2) * wing)
  context.closePath()
  context.fill()
  context.restore()
}

export async function exportPng(
  options: ExportOptions,
  requestedScale: number,
): Promise<PngExportResult> {
  const { map, includeMap } = options
  const annotations = visibleAnnotations(options.annotations)
  await ensureFontsLoaded(
    annotations.filter((annotation) => annotation.type === 'text').map((annotation) => annotation.fontFamily),
  )
  const nativePixels = map.width * map.height
  const maximumScale = Math.sqrt(MAX_PIXELS / nativePixels)
  const scale = Math.max(0.1, Math.min(requestedScale, maximumScale))
  const width = Math.max(1, Math.round(map.width * scale))
  const height = Math.max(1, Math.round(map.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Le navigateur ne peut pas créer le canvas d’export.')

  context.scale(scale, scale)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  if (includeMap) {
    const image = await loadImage(map.url)
    context.drawImage(image, 0, 0, map.width, map.height)
  }

  for (const annotation of annotations) {
    context.save()
    context.globalAlpha = annotation.opacity
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.strokeStyle = annotation.stroke
    context.fillStyle = annotation.stroke
    context.lineWidth = annotation.strokeWidth

    if (annotation.type === 'rect') {
      const box = normalizeBox(annotation)
      if (annotation.fill) {
        context.save()
        context.globalAlpha = annotation.opacity * annotation.fillOpacity
        context.fillStyle = annotation.fill
        context.fillRect(box.x, box.y, box.w, box.h)
        context.restore()
      }
      if (annotation.strokeWidth > 0) context.strokeRect(box.x, box.y, box.w, box.h)
    } else if (annotation.type === 'ellipse') {
      const box = normalizeBox(annotation)
      const centerX = box.x + box.w / 2
      const centerY = box.y + box.h / 2
      if (annotation.fill) {
        context.save()
        context.globalAlpha = annotation.opacity * annotation.fillOpacity
        context.fillStyle = annotation.fill
        context.beginPath()
        context.ellipse(centerX, centerY, box.w / 2, box.h / 2, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }
      if (annotation.strokeWidth > 0) {
        context.beginPath()
        context.ellipse(centerX, centerY, box.w / 2, box.h / 2, 0, 0, Math.PI * 2)
        context.stroke()
      }
    } else if (annotation.type === 'line' || annotation.type === 'arrow') {
      const endX = annotation.x + annotation.w
      const endY = annotation.y + annotation.h
      if (annotation.strokeWidth > 0) {
        context.beginPath()
        context.moveTo(annotation.x, annotation.y)
        context.lineTo(endX, endY)
        context.stroke()
      }
      if (annotation.type === 'arrow') {
        drawArrowHead(context, annotation.x, annotation.y, endX, endY, annotation.strokeWidth, annotation.stroke)
      }
    } else if (annotation.type === 'text') {
      const fontSize = annotation.fontSize ?? 28
      const lineHeight = fontSize * 1.25
      const halo = textHalo(annotation.stroke)
      const font = mapFont(annotation.fontFamily)
      context.font = `${font.weight} ${fontSize}px ${font.stack}`
      context.textBaseline = 'alphabetic'
      context.lineJoin = 'round'
      const lines = (annotation.text ?? '').split('\n')
      lines.forEach((line, index) => {
        const baseline = annotation.y + fontSize * 0.98 + index * lineHeight
        context.strokeStyle = halo
        context.lineWidth = Math.max(2.5, fontSize * 0.12)
        context.strokeText(line, annotation.x, baseline)
        context.fillStyle = annotation.stroke
        context.fillText(line, annotation.x, baseline)
      })
    }

    context.restore()
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('La génération du PNG a échoué.'))
    }, 'image/png')
  })

  return {
    blob,
    width,
    height,
    scale,
    widthCm: Math.round((width / 300) * 2.54 * 10) / 10,
    heightCm: Math.round((height / 300) * 2.54 * 10) / 10,
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Impossible d’encoder les données.'))
    reader.readAsDataURL(blob)
  })
}

async function imageDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Impossible de lire l’image de fond.')
  return blobDataUrl(await response.blob())
}

function fontFormat(source: string): string {
  const extension = source.split('.').pop()?.toLowerCase()
  if (extension === 'otf') return 'opentype'
  if (extension === 'woff') return 'woff'
  if (extension === 'woff2') return 'woff2'
  return 'truetype'
}

async function embeddedFontStyle(fonts: MapFont[]): Promise<string> {
  const rules = await Promise.all(
    fonts.map(async (font) => {
      if (!font.source) return ''
      try {
        const response = await fetch(font.source)
        if (!response.ok) return ''
        const data = await blobDataUrl(await response.blob())
        return `@font-face{font-family:"${font.family}";src:url("${data}") format("${fontFormat(font.source)}");font-weight:${font.weight};font-style:normal;font-display:block}`
      } catch {
        return ''
      }
    }),
  )
  return rules.filter(Boolean).join('')
}

export async function buildSvg(options: ExportOptions): Promise<string> {
  const { map, includeMap } = options
  const annotations = visibleAnnotations(options.annotations)
  const textFonts = new Map<string, MapFont>()
  for (const annotation of annotations) {
    if (annotation.type === 'text') {
      const font = mapFont(annotation.fontFamily)
      textFonts.set(font.family, font)
    }
  }
  await ensureFontsLoaded([...textFonts.values()].map((font) => font.family))
  const fontStyle = await embeddedFontStyle([...textFonts.values()])

  const parts: string[] = []
  const defs: string[] = []
  if (fontStyle) defs.push(`<style>${fontStyle}</style>`)

  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${map.width}" height="${map.height}" viewBox="0 0 ${map.width} ${map.height}">`,
  )

  if (includeMap) {
    const data = await imageDataUrl(map.url)
    parts.push(`<image x="0" y="0" width="${map.width}" height="${map.height}" xlink:href="${data}" />`)
  }

  for (const annotation of annotations) {
    const opacity = annotation.opacity === 1 ? '' : ` opacity="${annotation.opacity}"`
    const stroke = annotation.strokeWidth > 0
      ? ` stroke="${annotation.stroke}" stroke-width="${annotation.strokeWidth}"`
      : ' stroke="none"'
    const fill = annotation.fill
      ? ` fill="${annotation.fill}" fill-opacity="${annotation.fillOpacity}"`
      : ' fill="none"'

    if (annotation.type === 'rect') {
      const box = normalizeBox(annotation)
      parts.push(
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"${fill}${stroke}${opacity} />`,
      )
    } else if (annotation.type === 'ellipse') {
      const box = normalizeBox(annotation)
      parts.push(
        `<ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" rx="${box.w / 2}" ry="${box.h / 2}"${fill}${stroke}${opacity} />`,
      )
    } else if (annotation.type === 'line' || annotation.type === 'arrow') {
      const endX = annotation.x + annotation.w
      const endY = annotation.y + annotation.h
      const markerId = `arrow-${annotation.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
      if (annotation.type === 'arrow') {
        defs.push(
          `<marker id="${markerId}" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto"><path d="M 0 0 L 6 3 L 0 6 Z" fill="${annotation.stroke}" /></marker>`,
        )
      }
      const marker = annotation.type === 'arrow' ? ` marker-end="url(#${markerId})"` : ''
      parts.push(
        `<line x1="${annotation.x}" y1="${annotation.y}" x2="${endX}" y2="${endY}"${stroke} stroke-linecap="round"${marker}${opacity} />`,
      )
    } else if (annotation.type === 'text') {
      const fontSize = annotation.fontSize ?? 28
      const lineHeight = fontSize * 1.25
      const halo = textHalo(annotation.stroke)
      const haloWidth = Math.max(2.5, fontSize * 0.12)
      const font = mapFont(annotation.fontFamily)
      const lines = (annotation.text ?? '').split('\n')
      const spans = lines
        .map(
          (line, index) =>
            `<tspan x="${annotation.x}" y="${annotation.y + fontSize * 0.98 + index * lineHeight}">${escapeXml(line)}</tspan>`,
        )
        .join('')
      parts.push(
        `<text font-family="${escapeXml(font.stack)}" font-size="${fontSize}" font-weight="${font.weight}" fill="${annotation.stroke}" stroke="${halo}" stroke-width="${haloWidth}" stroke-linejoin="round" paint-order="stroke" ${opacity ? opacity.trim() : ''}>${spans}</text>`,
      )
    }
  }

  if (defs.length) parts.splice(2, 0, `<defs>${defs.join('')}</defs>`)
  parts.push('</svg>')
  return parts.join('\n')
}

export async function exportSvg(options: ExportOptions): Promise<{ blob: Blob; filename: string }> {
  const svg = await buildSvg(options)
  const filename = `${safeFileName(options.map.name)}${options.includeMap ? '' : '-calques'}.svg`
  return { blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename }
}

export async function downloadPng(
  options: ExportOptions,
  scale: number,
): Promise<PngExportResult & { filename: string }> {
  const result = await exportPng(options, scale)
  const filename = `${safeFileName(options.map.name)}${options.includeMap ? '' : '-calques'}-${result.width}x${result.height}.png`
  download(result.blob, filename)
  return { ...result, filename }
}

export async function downloadSvg(options: ExportOptions): Promise<string> {
  const { blob, filename } = await exportSvg(options)
  download(blob, filename)
  return filename
}

export function downloadJson(options: ExportOptions): string {
  const filename = `${safeFileName(options.map.file.replace(/\.[^.]+$/, ''))}.wmm`
  const payload = {
    format: 'wmm',
    version: 1,
    generator: 'WMM — Wiki Map Maker',
    map: options.map.file,
    exportedAt: new Date().toISOString(),
    annotations: options.annotations,
  }
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename)
  return filename
}

export function annotationTextSize(annotation: Annotation): { width: number; height: number } {
  const fontSize = annotation.fontSize ?? 28
  return {
    width: estimatedTextWidth(annotation.text ?? '', fontSize, annotation.fontFamily),
    height: annotation.h > 0 ? annotation.h : fontSize * 1.25,
  }
}

export function textContrast(hex: string): '#ffffff' | '#111111' {
  return isDarkColor(hex) ? '#ffffff' : '#111111'
}
