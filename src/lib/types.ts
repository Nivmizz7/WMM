export type AnnotationType = 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

export type FontFamily = 'IBM Plex Sans' | 'Brunson' | 'Impact' | 'IBM Plex Mono'
export type TextAlign = 'left' | 'center' | 'right'

export type Tool = 'select' | 'pan' | AnnotationType

export interface Annotation {
  id: string
  type: AnnotationType
  x: number
  y: number
  w: number
  h: number
  stroke: string
  fill: string | null
  fillOpacity: number
  strokeWidth: number
  opacity: number
  hidden: boolean
  text?: string
  fontSize?: number
  fontFamily?: FontFamily
  textAlign?: TextAlign
}

export interface MapSummary {
  id: string
  file: string
  name: string
  locale: 'fr' | 'en'
  version: number
  width: number
  height: number
  url: string
  thumbUrl: string
  annotations: number
  updatedAt: string | null
}

export interface MapVersion {
  file: string
  name: string
  locale: 'fr' | 'en'
  version: number
  width: number
  height: number
  url: string
}

export interface Project {
  version: 1
  map: string
  annotations: Annotation[]
  updatedAt: string | null
}

export interface DrawingStyle {
  stroke: string
  fill: string | null
  fillOpacity: number
  strokeWidth: number
  opacity: number
  fontFamily: FontFamily
}

export const DEFAULT_STYLE: DrawingStyle = {
  stroke: '#000000',
  fill: null,
  fillOpacity: 0.16,
  strokeWidth: 3,
  opacity: 1,
  fontFamily: 'IBM Plex Sans',
}

export const COLORS = [
  { name: 'Noir', value: '#000000' },
  { name: 'Blanc', value: '#ffffff' },
  { name: 'Rouge', value: '#ff0000' },
  { name: 'Vert', value: '#00ff00' },
  { name: 'Bleu', value: '#0000ff' },
  { name: 'Jaune', value: '#ffff00' },
] as const

export const TYPE_LABELS: Record<AnnotationType, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Ligne',
  arrow: 'Flèche',
  text: 'Texte',
}
