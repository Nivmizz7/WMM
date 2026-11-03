import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { LoaderCircle } from 'lucide-react'
import type { Annotation, DrawingStyle, MapSummary, Tool } from '../lib/types'
import { mapFont } from '../lib/fonts'
import { createAnnotation, estimatedTextHeight, estimatedTextWidth, textHalo } from '../lib/annotations'
import { useI18n } from '../lib/i18n'

export interface Viewport {
  x: number
  y: number
  scale: number
}

interface CanvasStageProps {
  map: MapSummary
  annotations: Annotation[]
  selectedIds: string[]
  tool: Tool
  spacePressed: boolean
  viewport: Viewport
  drawingStyle: DrawingStyle
  onViewportChange: (updater: (previous: Viewport) => Viewport) => void
  onSizeChange: (size: { width: number; height: number }) => void
  onSelect: (ids: string[]) => void
  onToolChange: (tool: Tool) => void
  onBeginEdit: () => void
  onUpdateEdit: (updater: (previous: Annotation[]) => Annotation[]) => void
  onEndEdit: () => void
  onPointerWorld: (point: { x: number; y: number } | null) => void
  onRequestTextEdit: (id: string) => void
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'

type DragState =
  | {
      type: 'pan'
      pointerId: number
      clientX: number
      clientY: number
      viewport: Viewport
    }
  | {
      type: 'move'
      pointerId: number
      startX: number
      startY: number
      ids: string[]
      snapshot: Annotation[]
      moved: boolean
    }
  | {
      type: 'resize'
      pointerId: number
      startX: number
      startY: number
      annotation: Annotation
      handle: Handle
      moved: boolean
    }
  | {
      type: 'create'
      pointerId: number
      startX: number
      startY: number
      id: string
      tool: 'rect' | 'ellipse' | 'line' | 'arrow'
      moved: boolean
    }

const MIN_SCALE = 0.02
const MAX_SCALE = 12
const MIN_BOX = 4

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function snapLine(startX: number, startY: number, endX: number, endY: number) {
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)
  if (length < 1) return { x: endX, y: endY }
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return {
    x: startX + Math.cos(snapped) * length,
    y: startY + Math.sin(snapped) * length,
  }
}

function textSize(annotation: Annotation) {
  const fontSize = annotation.fontSize ?? 28
  return {
    width: estimatedTextWidth(annotation.text ?? '', fontSize, annotation.fontFamily),
    height: Math.max(annotation.h || 0, estimatedTextHeight(annotation.text ?? '', fontSize)),
  }
}

function boxHandlePosition(annotation: Annotation, handle: Handle) {
  const left = annotation.x
  const right = annotation.x + annotation.w
  const top = annotation.y
  const bottom = annotation.y + annotation.h
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  switch (handle) {
    case 'nw':
      return { x: left, y: top }
    case 'n':
      return { x: centerX, y: top }
    case 'ne':
      return { x: right, y: top }
    case 'e':
      return { x: right, y: centerY }
    case 'se':
      return { x: right, y: bottom }
    case 's':
      return { x: centerX, y: bottom }
    case 'sw':
      return { x: left, y: bottom }
    case 'w':
      return { x: left, y: centerY }
    case 'p1':
      return { x: annotation.x, y: annotation.y }
    case 'p2':
      return { x: annotation.x + annotation.w, y: annotation.y + annotation.h }
  }
}

function IconSpinner() {
  return <LoaderCircle size={18} className="spin" aria-hidden="true" />
}

export function CanvasStage({
  map,
  annotations,
  selectedIds,
  tool,
  spacePressed,
  viewport,
  drawingStyle,
  onViewportChange,
  onSizeChange,
  onSelect,
  onToolChange,
  onBeginEdit,
  onUpdateEdit,
  onEndEdit,
  onPointerWorld,
  onRequestTextEdit,
}: CanvasStageProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [interaction, setInteraction] = useState<'idle' | 'pan' | 'move' | 'resize' | 'draw'>('idle')
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [, setFontVersion] = useState(0)
  const frameRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null)

  const callbacksRef = useRef({ onSizeChange, onViewportChange, onPointerWorld })
  callbacksRef.current = { onSizeChange, onViewportChange, onPointerWorld }

  const selectedAnnotations = useMemo(
    () => annotations.filter((annotation) => selectedIds.includes(annotation.id) && !annotation.hidden),
    [annotations, selectedIds],
  )
  const singleSelected = selectedAnnotations.length === 1 ? selectedAnnotations[0] : null

  useEffect(() => {
    setImageState('loading')
  }, [map.id])

  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    const refreshFontMetrics = () => setFontVersion((value) => value + 1)
    document.fonts.addEventListener('loadingdone', refreshFontMetrics)
    void document.fonts.ready.then(refreshFontMetrics)
    return () => document.fonts.removeEventListener('loadingdone', refreshFontMetrics)
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      callbacksRef.current.onSizeChange({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleWheel = useCallback((event: WheelEvent) => {
    const element = containerRef.current
    if (!element) return
    event.preventDefault()
    const rectangle = element.getBoundingClientRect()
    const localX = event.clientX - rectangle.left
    const localY = event.clientY - rectangle.top
    const factor = Math.exp(-event.deltaY * 0.0015)
    callbacksRef.current.onViewportChange((previous) => {
      const nextScale = clamp(previous.scale * factor, MIN_SCALE, MAX_SCALE)
      if (nextScale === previous.scale) return previous
      const worldX = (localX - previous.x) / previous.scale
      const worldY = (localY - previous.y) / previous.scale
      return {
        scale: nextScale,
        x: localX - worldX * nextScale,
        y: localY - worldY * nextScale,
      }
    })
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const listener = (event: WheelEvent) => handleWheel(event)
    element.addEventListener('wheel', listener, { passive: false })
    return () => element.removeEventListener('wheel', listener)
  }, [handleWheel])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const schedulePointerWorld = useCallback((point: { x: number; y: number } | null) => {
    pendingPointRef.current = point
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      callbacksRef.current.onPointerWorld(pendingPointRef.current)
    })
  }, [])

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rectangle = containerRef.current?.getBoundingClientRect()
    if (!rectangle) return { x: 0, y: 0 }
    return {
      x: (clientX - rectangle.left - viewport.x) / viewport.scale,
      y: (clientY - rectangle.top - viewport.y) / viewport.scale,
    }
  }

  function capturePointer(pointerId: number) {
    try {
      containerRef.current?.setPointerCapture(pointerId)
    } catch {
      // Pointer capture can fail when the pointer is already released.
    }
  }

  const finishDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'pan') {
      dragRef.current = null
      setInteraction('idle')
      return
    }
    if (drag.type === 'create') {
      if (!drag.moved) {
        const defaultWidth = drag.tool === 'line' || drag.tool === 'arrow' ? 180 : 180
        const defaultHeight = drag.tool === 'line' || drag.tool === 'arrow' ? 0 : 110
        onUpdateEdit((previous) =>
          previous.map((annotation) =>
            annotation.id === drag.id
              ? {
                  ...annotation,
                  x: Math.round(drag.startX),
                  y: Math.round(drag.startY),
                  w: defaultWidth,
                  h: defaultHeight,
                }
              : annotation,
          ),
        )
      }
      onEndEdit()
      onToolChange('select')
      dragRef.current = null
      setInteraction('idle')
      return
    }
    onEndEdit()
    dragRef.current = null
    setInteraction('idle')
  }, [onEndEdit, onToolChange, onUpdateEdit])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return
    containerRef.current?.focus({ preventScroll: true })
    const target = event.target as Element
    const isPan = event.button === 1 || spacePressed || tool === 'pan'

    if (isPan) {
      event.preventDefault()
      dragRef.current = {
        type: 'pan',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        viewport,
      }
      capturePointer(event.pointerId)
      setInteraction('pan')
      return
    }

    const point = clientToWorld(event.clientX, event.clientY)
    schedulePointerWorld({ x: point.x, y: point.y })

    if (tool === 'select') {
      const handleElement = target.closest<HTMLElement>('[data-handle]')
      if (handleElement && selectedIds.length === 1) {
        const annotation = annotations.find((item) => item.id === selectedIds[0])
        const handle = handleElement.dataset.handle as Handle | undefined
        if (annotation && handle && !annotation.hidden) {
          onBeginEdit()
          dragRef.current = {
            type: 'resize',
            pointerId: event.pointerId,
            startX: point.x,
            startY: point.y,
            annotation,
            handle,
            moved: false,
          }
          capturePointer(event.pointerId)
          setInteraction('resize')
          event.preventDefault()
          return
        }
      }

      const annotationElement = target.closest<HTMLElement>('[data-annotation]')
      const annotationId = annotationElement?.dataset.annotation
      if (annotationId) {
        const annotation = annotations.find((item) => item.id === annotationId)
        if (!annotation || annotation.hidden) return
        let nextSelection: string[]
        if (event.shiftKey) {
          nextSelection = selectedIds.includes(annotationId)
            ? selectedIds.filter((id) => id !== annotationId)
            : [...selectedIds, annotationId]
        } else {
          nextSelection = selectedIds.includes(annotationId) ? selectedIds : [annotationId]
        }
        onSelect(nextSelection)
        if (nextSelection.includes(annotationId)) {
          onBeginEdit()
          dragRef.current = {
            type: 'move',
            pointerId: event.pointerId,
            startX: point.x,
            startY: point.y,
            ids: nextSelection,
            snapshot: annotations,
            moved: false,
          }
          capturePointer(event.pointerId)
          setInteraction('move')
          event.preventDefault()
        }
        return
      }

      onSelect([])
      return
    }

    if (tool === 'text') {
      event.preventDefault()
      const annotation = createAnnotation('text', point, drawingStyle)
      annotation.w = estimatedTextWidth(
        annotation.text ?? '',
        annotation.fontSize ?? 28,
        annotation.fontFamily,
      )
      annotation.h = estimatedTextHeight(annotation.text ?? '', annotation.fontSize ?? 28)
      onBeginEdit()
      onUpdateEdit((previous) => [...previous, annotation])
      onSelect([annotation.id])
      onEndEdit()
      onToolChange('select')
      onRequestTextEdit(annotation.id)
      return
    }

    event.preventDefault()
    const annotation = createAnnotation(tool, point, drawingStyle)
    onSelect([annotation.id])
    onBeginEdit()
    onUpdateEdit((previous) => [...previous, annotation])
    dragRef.current = {
      type: 'create',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      id: annotation.id,
      tool,
      moved: false,
    }
    capturePointer(event.pointerId)
    setInteraction('draw')
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) {
      if (!spacePressed) {
        const point = clientToWorld(event.clientX, event.clientY)
        schedulePointerWorld({ x: point.x, y: point.y })
      }
      return
    }

    if (drag.type === 'pan') {
      const deltaX = event.clientX - drag.clientX
      const deltaY = event.clientY - drag.clientY
      onViewportChange(() => ({
        scale: drag.viewport.scale,
        x: drag.viewport.x + deltaX,
        y: drag.viewport.y + deltaY,
      }))
      return
    }

    const point = clientToWorld(event.clientX, event.clientY)
    schedulePointerWorld({ x: point.x, y: point.y })
    let deltaX = point.x - drag.startX
    let deltaY = point.y - drag.startY

    if (drag.type === 'move') {
      if (event.shiftKey) {
        if (Math.abs(deltaX) >= Math.abs(deltaY)) deltaY = 0
        else deltaX = 0
      }
      deltaX = Math.round(deltaX)
      deltaY = Math.round(deltaY)
      if (deltaX === 0 && deltaY === 0) return
      drag.moved = true
      const idSet = new Set(drag.ids)
      const snapshot = drag.snapshot
      onUpdateEdit(() =>
        snapshot.map((annotation) =>
          idSet.has(annotation.id)
            ? {
                ...annotation,
                x: annotation.x + deltaX,
                y: annotation.y + deltaY,
              }
            : annotation,
        ),
      )
      return
    }

    if (drag.type === 'resize') {
      const source = drag.annotation
      if (source.type === 'line' || source.type === 'arrow') {
        if (drag.handle !== 'p1' && drag.handle !== 'p2') return
        const startX = source.x
        const startY = source.y
        const endX = source.x + source.w
        const endY = source.y + source.h
        let nextStartX = startX
        let nextStartY = startY
        let nextEndX = endX
        let nextEndY = endY
        if (drag.handle === 'p1') {
          nextStartX = startX + deltaX
          nextStartY = startY + deltaY
        } else {
          nextEndX = endX + deltaX
          nextEndY = endY + deltaY
        }
        if (event.shiftKey) {
          const fixedX = drag.handle === 'p1' ? nextEndX : nextStartX
          const fixedY = drag.handle === 'p1' ? nextEndY : nextStartY
          const mobileX = drag.handle === 'p1' ? nextStartX : nextEndX
          const mobileY = drag.handle === 'p1' ? nextStartY : nextEndY
          const snapped = snapLine(fixedX, fixedY, mobileX, mobileY)
          if (drag.handle === 'p1') {
            nextStartX = snapped.x
            nextStartY = snapped.y
          } else {
            nextEndX = snapped.x
            nextEndY = snapped.y
          }
        }
        drag.moved = true
        onUpdateEdit((previous) =>
          previous.map((annotation) =>
            annotation.id === source.id
              ? {
                  ...annotation,
                  x: Math.round(nextStartX),
                  y: Math.round(nextStartY),
                  w: Math.round(nextEndX - nextStartX),
                  h: Math.round(nextEndY - nextStartY),
                }
              : annotation,
          ),
        )
        return
      }

      if (drag.handle === 'p1' || drag.handle === 'p2') return
      let left = source.x
      let top = source.y
      let right = source.x + source.w
      let bottom = source.y + source.h
      deltaX = Math.round(deltaX)
      deltaY = Math.round(deltaY)
      if (drag.handle.includes('w')) left = clamp(source.x + deltaX, -100000, right - MIN_BOX)
      if (drag.handle.includes('e')) right = clamp(source.x + source.w + deltaX, left + MIN_BOX, 100000)
      if (drag.handle.includes('n')) top = clamp(source.y + deltaY, -100000, bottom - MIN_BOX)
      if (drag.handle.includes('s')) bottom = clamp(source.y + source.h + deltaY, top + MIN_BOX, 100000)

      if (event.shiftKey && drag.handle.length === 2) {
        const aspect = source.w / Math.max(source.h, 1)
        const width = right - left
        const height = bottom - top
        if (width / Math.max(height, 1) > aspect) {
          const adjustedHeight = width / aspect
          if (drag.handle.includes('n')) top = bottom - adjustedHeight
          else bottom = top + adjustedHeight
        } else {
          const adjustedWidth = height * aspect
          if (drag.handle.includes('w')) left = right - adjustedWidth
          else right = left + adjustedWidth
        }
      }

      drag.moved = true
      onUpdateEdit((previous) =>
        previous.map((annotation) =>
          annotation.id === source.id
            ? {
                ...annotation,
                x: Math.round(left),
                y: Math.round(top),
                w: Math.round(right - left),
                h: Math.round(bottom - top),
              }
            : annotation,
        ),
      )
      return
    }

    if (drag.type === 'create') {
      drag.moved = true
      if (drag.tool === 'rect' || drag.tool === 'ellipse') {
        let width = point.x - drag.startX
        let height = point.y - drag.startY
        if (event.shiftKey) {
          const size = Math.max(Math.abs(width), Math.abs(height))
          width = (width < 0 ? -1 : 1) * size
          height = (height < 0 ? -1 : 1) * size
        }
        const x = Math.min(drag.startX, drag.startX + width)
        const y = Math.min(drag.startY, drag.startY + height)
        onUpdateEdit((previous) =>
          previous.map((annotation) =>
            annotation.id === drag.id
              ? {
                  ...annotation,
                  x: Math.round(x),
                  y: Math.round(y),
                  w: Math.max(MIN_BOX, Math.round(Math.abs(width))),
                  h: Math.max(MIN_BOX, Math.round(Math.abs(height))),
                }
              : annotation,
          ),
        )
      } else {
        let endX = point.x
        let endY = point.y
        if (event.shiftKey) {
          const snapped = snapLine(drag.startX, drag.startY, endX, endY)
          endX = snapped.x
          endY = snapped.y
        }
        onUpdateEdit((previous) =>
          previous.map((annotation) =>
            annotation.id === drag.id
              ? {
                  ...annotation,
                  x: Math.round(drag.startX),
                  y: Math.round(drag.startY),
                  w: Math.round(endX - drag.startX),
                  h: Math.round(endY - drag.startY),
                }
              : annotation,
          ),
        )
      }
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    try {
      containerRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // The pointer may already have been released by the browser.
    }
    finishDrag()
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as Element
    const annotationElement = target.closest<HTMLElement>('[data-annotation]')
    const id = annotationElement?.dataset.annotation
    if (!id) return
    const annotation = annotations.find((item) => item.id === id)
    if (annotation?.type === 'text') {
      onSelect([id])
      onRequestTextEdit(id)
    }
  }

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && dragRef.current?.type === 'pan') {
        // Interaction stays controlled by the pointer, but the cursor updates through props.
      }
    }
    window.addEventListener('keyup', handleKeyUp)
    return () => window.removeEventListener('keyup', handleKeyUp)
  }, [])

  const markerArrows = annotations.filter(
    (annotation) => annotation.type === 'arrow' && !annotation.hidden && annotation.strokeWidth > 0,
  )

  const stageClass = [
    'canvas-stage',
    `tool-${tool}`,
    spacePressed ? 'is-space' : '',
    interaction !== 'idle' ? `is-${interaction}` : '',
    imageState !== 'ready' ? 'is-loading-image' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className={stageClass}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => schedulePointerWorld(null)}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(event) => event.preventDefault()}
      tabIndex={0}
    >
      <div
        className="map-world"
        style={{
          width: map.width,
          height: map.height,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        <img
          className="map-image"
          src={map.url}
          alt=""
          draggable={false}
          onLoad={() => setImageState('ready')}
          onError={() => setImageState('error')}
        />
        <svg
          className="annotation-layer"
          width={map.width}
          height={map.height}
          viewBox={`0 0 ${map.width} ${map.height}`}
          aria-label="Annotations de la carte"
        >
          <defs>
            {markerArrows.map((annotation) => {
              const markerId = `marker-${annotation.id}`
              return (
                <marker
                  key={markerId}
                  id={markerId}
                  viewBox="0 0 6 6"
                  refX="5.4"
                  refY="3"
                  markerWidth="6"
                  markerHeight="6"
                  markerUnits="strokeWidth"
                  orient="auto"
                >
                  <path d="M 0 0 L 6 3 L 0 6 Z" fill={annotation.stroke} />
                </marker>
              )
            })}
          </defs>

          {annotations.map((annotation) => {
            if (annotation.hidden) return null
            const opacity = annotation.opacity
            const common = {
              'data-annotation': annotation.id,
              style: { pointerEvents: 'all' as const },
            }

            if (annotation.type === 'rect') {
              const x = Math.min(annotation.x, annotation.x + annotation.w)
              const y = Math.min(annotation.y, annotation.y + annotation.h)
              const width = Math.abs(annotation.w)
              const height = Math.abs(annotation.h)
              return (
                <rect
                  key={annotation.id}
                  {...common}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={annotation.fill ?? 'none'}
                  fillOpacity={annotation.fill ? annotation.fillOpacity : 0}
                  stroke={annotation.stroke}
                  strokeWidth={annotation.strokeWidth}
                  opacity={opacity}
                  strokeLinejoin="round"
                />
              )
            }

            if (annotation.type === 'ellipse') {
              const x = Math.min(annotation.x, annotation.x + annotation.w)
              const y = Math.min(annotation.y, annotation.y + annotation.h)
              const width = Math.abs(annotation.w)
              const height = Math.abs(annotation.h)
              return (
                <ellipse
                  key={annotation.id}
                  {...common}
                  cx={x + width / 2}
                  cy={y + height / 2}
                  rx={width / 2}
                  ry={height / 2}
                  fill={annotation.fill ?? 'none'}
                  fillOpacity={annotation.fill ? annotation.fillOpacity : 0}
                  stroke={annotation.stroke}
                  strokeWidth={annotation.strokeWidth}
                  opacity={opacity}
                  strokeLinejoin="round"
                />
              )
            }

            if (annotation.type === 'line' || annotation.type === 'arrow') {
              const endX = annotation.x + annotation.w
              const endY = annotation.y + annotation.h
              return (
                <g key={annotation.id} opacity={opacity}>
                  <line
                    x1={annotation.x}
                    y1={annotation.y}
                    x2={endX}
                    y2={endY}
                    stroke={annotation.stroke}
                    strokeWidth={annotation.strokeWidth}
                    strokeLinecap="round"
                    markerEnd={annotation.type === 'arrow' ? `url(#marker-${annotation.id})` : undefined}
                    data-annotation={annotation.id}
                    style={{ pointerEvents: 'all' }}
                  />
                  <line
                    x1={annotation.x}
                    y1={annotation.y}
                    x2={endX}
                    y2={endY}
                    stroke="transparent"
                    strokeWidth={Math.max(20, annotation.strokeWidth + 16)}
                    strokeLinecap="round"
                    data-annotation={annotation.id}
                    style={{ pointerEvents: 'stroke' }}
                  />
                </g>
              )
            }

            const fontSize = annotation.fontSize ?? 28
            const font = mapFont(annotation.fontFamily)
            const bounds = textSize(annotation)
            return (
              <g key={annotation.id} opacity={opacity} data-annotation={annotation.id}>
                <text
                  x={annotation.x}
                  y={annotation.y + fontSize * 0.98}
                  fill={annotation.stroke}
                  stroke={textHalo(annotation.stroke)}
                  strokeWidth={Math.max(2.5, fontSize * 0.12)}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  fontFamily={font.stack}
                  fontSize={fontSize}
                  fontWeight={font.weight}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {(annotation.text ?? '').split('\n').map((line, index) => (
                    <tspan key={index} x={annotation.x} dy={index === 0 ? 0 : fontSize * 1.25}>
                      {line || ' '}
                    </tspan>
                  ))}
                </text>
                <rect
                  x={annotation.x}
                  y={annotation.y}
                  width={bounds.width}
                  height={bounds.height}
                  fill="transparent"
                  data-annotation={annotation.id}
                  style={{ pointerEvents: 'all' }}
                />
              </g>
            )
          })}

          {selectedAnnotations.map((annotation) => {
            if (annotation.id !== singleSelected?.id) {
              const bounds =
                annotation.type === 'text'
                  ? textSize(annotation)
                  : {
                      width: Math.abs(annotation.w),
                      height: Math.abs(annotation.h),
                    }
              const x =
                annotation.type === 'text'
                  ? annotation.x
                  : Math.min(annotation.x, annotation.x + annotation.w)
              const y =
                annotation.type === 'text'
                  ? annotation.y
                  : Math.min(annotation.y, annotation.y + annotation.h)
              return (
                <g key={`selection-${annotation.id}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={x}
                    y={y}
                    width={bounds.width}
                    height={bounds.height}
                    fill="none"
                    stroke="#111111"
                    strokeWidth={1.4 / viewport.scale}
                    strokeDasharray={`${5 / viewport.scale} ${4 / viewport.scale}`}
                    opacity={0.8}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={bounds.width}
                    height={bounds.height}
                    fill="none"
                    stroke="#f5f5f2"
                    strokeWidth={1.4 / viewport.scale}
                    strokeDasharray={`${5 / viewport.scale} ${4 / viewport.scale}`}
                    strokeDashoffset={4.5 / viewport.scale}
                  />
                </g>
              )
            }
            return null
          })}

          {singleSelected && (
            <SelectionOverlay annotation={singleSelected} zoom={viewport.scale} />
          )}
        </svg>
      </div>

      {imageState === 'loading' && (
        <div className="stage-message">
          <IconSpinner />
          <span>{t('canvas.loading')}</span>
        </div>
      )}
      {imageState === 'error' && (
        <div className="stage-message is-error">
          <span>L’image de cette carte est introuvable.</span>
        </div>
      )}
    </div>
  )
}

function SelectionOverlay({ annotation, zoom }: { annotation: Annotation; zoom: number }) {
  const outlineWidth = 1 / zoom
  const handleSize = 7 / zoom
  const handleStroke = 1.25 / zoom
  const box =
    annotation.type === 'text'
      ? (() => {
          const bounds = textSize(annotation)
          return { x: annotation.x, y: annotation.y, w: bounds.width, h: bounds.height }
        })()
      : {
          x: Math.min(annotation.x, annotation.x + annotation.w),
          y: Math.min(annotation.y, annotation.y + annotation.h),
          w: Math.abs(annotation.w),
          h: Math.abs(annotation.h),
        }

  if (annotation.type === 'line' || annotation.type === 'arrow') {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line
          x1={annotation.x}
          y1={annotation.y}
          x2={annotation.x + annotation.w}
          y2={annotation.y + annotation.h}
          stroke="#111111"
          strokeWidth={outlineWidth}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          opacity={0.8}
        />
        <line
          x1={annotation.x}
          y1={annotation.y}
          x2={annotation.x + annotation.w}
          y2={annotation.y + annotation.h}
          stroke="#f5f5f2"
          strokeWidth={outlineWidth}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          strokeDashoffset={5 / zoom}
          opacity={0.9}
        />
        {(['p1', 'p2'] as Handle[]).map((handle) => {
          const position = boxHandlePosition(annotation, handle)
          return (
            <circle
              key={handle}
              cx={position.x}
              cy={position.y}
              r={handleSize}
              fill="#f0eee5"
              stroke="#171a16"
              strokeWidth={handleStroke}
              data-handle={handle}
              data-annotation={annotation.id}
              style={{ pointerEvents: 'all', cursor: 'crosshair' }}
            />
          )
        })}
      </g>
    )
  }

  const handles: Handle[] =
    annotation.type === 'text' ? [] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke="#111111"
        strokeWidth={outlineWidth}
        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
        opacity={0.8}
      />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke="#f5f5f2"
        strokeWidth={outlineWidth}
        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
        strokeDashoffset={5 / zoom}
        opacity={0.9}
      />
      {handles.map((handle) => {
        const position = boxHandlePosition(
          { ...annotation, x: box.x, y: box.y, w: box.w, h: box.h },
          handle,
        )
        return (
          <rect
            key={handle}
            x={position.x - handleSize / 2}
            y={position.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#f0eee5"
            stroke="#171a16"
            strokeWidth={handleStroke}
            data-handle={handle}
            data-annotation={annotation.id}
            style={{
              pointerEvents: 'all',
              cursor: `${handle}-resize`,
            }}
          />
        )
      })}
    </g>
  )
}
