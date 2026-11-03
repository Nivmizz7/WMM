import type { FontFamily } from './types'

export interface MapFont {
  family: FontFamily
  label: string
  stack: string
  weight: number
  source?: string
}

export const DEFAULT_FONT_FAMILY: FontFamily = 'IBM Plex Sans'

// Keep the server-side font validation in sync when adding a family here.
export const MAP_FONTS: readonly MapFont[] = [
  {
    family: 'IBM Plex Sans',
    label: 'IBM Plex Sans',
    stack: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    weight: 500,
  },
  {
    family: 'Brunson',
    label: 'Brunson',
    stack: '"Brunson", Georgia, "Times New Roman", serif',
    weight: 400,
    source: '/fonts/Brunson.ttf',
  },
  {
    family: 'Impact',
    label: 'Impact',
    stack: '"Impact", "Arial Narrow", sans-serif',
    weight: 400,
    source: '/fonts/Impact.ttf',
  },
  {
    family: 'IBM Plex Mono',
    label: 'IBM Plex Mono',
    stack: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    weight: 400,
  },
]

export function mapFont(family?: string | null): MapFont {
  return MAP_FONTS.find((font) => font.family === family) ?? MAP_FONTS[0]
}

export function normalizeFontFamily(value: unknown): FontFamily {
  return typeof value === 'string' && MAP_FONTS.some((font) => font.family === value)
    ? (value as FontFamily)
    : DEFAULT_FONT_FAMILY
}

export async function ensureFontsLoaded(families: Iterable<string | null | undefined>): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const specs = new Set<string>()
  for (const family of families) {
    const font = mapFont(family)
    specs.add(`${font.weight} 32px "${font.family}"`)
  }
  await Promise.all([...specs].map((spec) => document.fonts.load(spec).catch(() => [])))
  await document.fonts.ready
}
