import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Crosshair,
  Download,
  Eye,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { CanvasStage, type Viewport } from './components/CanvasStage'
import { Inspector } from './components/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { VersionPreviewDialog } from './components/VersionPreviewDialog'
import { getMapVersions, getMaps, getProject, importWmmProjects, saveProject } from './lib/api'
import type { Annotation, DrawingStyle, MapSummary, MapVersion, Tool } from './lib/types'
import { DEFAULT_STYLE } from './lib/types'
import { normalizeFontFamily } from './lib/fonts'
import { clamp, formatDate, uid } from './lib/annotations'
import { useAnnotationHistory } from './lib/useAnnotationHistory'
import { useI18n } from './lib/i18n'

const LAST_MAP_KEY = 'wmm:last-map'
const STYLE_KEY = 'wmm:drawing-style'

const TOOL_HINTS: Record<Tool, string> = {
  select: 'toolHint.select',
  pan: 'toolHint.pan',
  rect: 'toolHint.rect',
  ellipse: 'toolHint.ellipse',
  line: 'toolHint.line',
  arrow: 'toolHint.arrow',
  text: 'toolHint.text',
}

interface ToastMessage {
  id: number
  text: string
  tone: 'default' | 'error'
}

function readDrawingStyle(): DrawingStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY)
    if (!raw) return DEFAULT_STYLE
    const parsed = JSON.parse(raw) as Partial<DrawingStyle>
    if (
      typeof parsed.stroke !== 'string' ||
      (parsed.fill !== null && typeof parsed.fill !== 'string') ||
      typeof parsed.fillOpacity !== 'number' ||
      typeof parsed.strokeWidth !== 'number' ||
      typeof parsed.opacity !== 'number'
    ) {
      return DEFAULT_STYLE
    }
    return {
      stroke: parsed.stroke,
      fill: parsed.fill ?? null,
      fillOpacity: clamp(parsed.fillOpacity, 0, 1),
      strokeWidth: clamp(parsed.strokeWidth, 0, 20),
      opacity: clamp(parsed.opacity, 0, 1),
      fontFamily: normalizeFontFamily(parsed.fontFamily),
    }
  } catch {
    return DEFAULT_STYLE
  }
}

function normalizeProjectAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.map((annotation) =>
    annotation.type === 'text'
      ? { ...annotation, fontFamily: normalizeFontFamily(annotation.fontFamily) }
      : annotation,
  )
}

function BrandLockup() {
  return (
    <div className="brand-copy">
      <strong>WMM</strong>
      <span>Wiki Map Maker</span>
    </div>
  )
}

function FranceFlag() {
  return (
    <svg className="language-flag" viewBox="0 0 18 12" aria-hidden="true">
      <rect width="6" height="12" fill="#0055a4" />
      <rect x="6" width="6" height="12" fill="#fff" />
      <rect x="12" width="6" height="12" fill="#ef4135" />
    </svg>
  )
}

function UnitedKingdomFlag() {
  return (
    <svg className="language-flag" viewBox="0 0 18 12" aria-hidden="true">
      <rect width="18" height="12" rx="1" fill="#012169" />
      <path d="M0 0l18 12M18 0L0 12" stroke="#fff" strokeWidth="3" />
      <path d="M0 0l18 12M18 0L0 12" stroke="#c8102e" strokeWidth="1.2" />
      <path d="M9 0v12M0 6h18" stroke="#fff" strokeWidth="4" />
      <path d="M9 0v12M0 6h18" stroke="#c8102e" strokeWidth="2" />
    </svg>
  )
}

function EmptyMapGlyph() {
  return (
    <svg className="empty-glyph" viewBox="0 0 92 72" fill="none" aria-hidden="true">
      <path d="M6 15l25-7 30 9 25-8v50l-25 8-30-9-25 7V15z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M31 8v50M61 17v50" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M13 26h11M14 32h8M39 31h14M39 38h9M68 30l9-3M68 38h8M13 46l12-3M39 49l16-4M68 49l8 3" stroke="currentColor" strokeWidth="0.9" opacity="0.38" />
      <rect x="39" y="23" width="15" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
    </svg>
  )
}

function placeholderDimensions(width: number, height: number): string {
  return `${width.toLocaleString('fr-FR')} × ${height.toLocaleString('fr-FR')}`
}

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const editor = useAnnotationHistory()
  const {
    annotations,
    canUndo,
    canRedo,
    reset: resetHistory,
    commit,
    begin,
    update,
    end,
    undo,
    redo,
    getSnapshot,
  } = editor

  const [maps, setMaps] = useState<MapSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mapsLoading, setMapsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectAttempt, setProjectAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle>(readDrawingStyle)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [textFocusToken, setTextFocusToken] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [versionPreview, setVersionPreview] = useState<MapVersion[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [mapsError, setMapsError] = useState<string | null>(null)

  const activeMap = maps.find((map) => map.id === activeId) ?? null
  const activeIdRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const revisionRef = useRef(0)
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const fittedMapRef = useRef<string | null>(null)
  const toastCounter = useRef(0)

  activeIdRef.current = activeId

  const notify = useCallback((text: string, tone: 'default' | 'error' = 'default') => {
    toastCounter.current += 1
    setToast({ id: toastCounter.current, text, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const loadLibrary = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setMapsLoading(true)
    else setRefreshing(true)
    setMapsError(null)
    try {
      const nextMaps = await getMaps()
      setMaps(nextMaps)
      const stored = localStorage.getItem(LAST_MAP_KEY)
      setActiveId((current) => {
        if (current && nextMaps.some((map) => map.id === current)) return current
        const preferred = stored ? nextMaps.find((map) => map.id === stored) : null
        return preferred?.id ?? nextMaps[0]?.id ?? null
      })
    } catch (error) {
      setMapsError(error instanceof Error ? error.message : 'Impossible de lire le dossier maps.')
    } finally {
      if (mode === 'initial') setMapsLoading(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadLibrary('initial')
  }, [loadLibrary])

  useEffect(() => {
    if (activeId) localStorage.setItem(LAST_MAP_KEY, activeId)
  }, [activeId])

  useEffect(() => {
    document.title = activeMap ? `${activeMap.name} — WMM` : 'WMM — Wiki Map Maker'
  }, [activeMap])

  useEffect(() => {
    if (!activeId) {
      resetHistory([])
      setSelectedIds([])
      dirtyRef.current = false
      setDirty(false)
      setProjectLoading(false)
      setProjectError(null)
      return
    }

    let cancelled = false
    setProjectLoading(true)
    setProjectError(null)
    setSelectedIds([])
    resetHistory([])
    dirtyRef.current = false
    setDirty(false)
    setSaveState('idle')
    setLastSavedAt(null)

    getProject(activeId)
      .then((project) => {
        if (cancelled) return
        resetHistory(normalizeProjectAnnotations(project.annotations))
        setLastSavedAt(project.updatedAt)
        setSaveState(project.updatedAt ? 'saved' : 'idle')
      })
      .catch((error) => {
        if (cancelled) return
        setProjectError(error instanceof Error ? error.message : 'Impossible de charger les calques.')
      })      .finally(() => {
        if (!cancelled) setProjectLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeId, projectAttempt, resetHistory])

  useEffect(() => {
    if (!activeMap || stageSize.width === 0 || stageSize.height === 0) return
    if (fittedMapRef.current === activeMap.id) return
    fittedMapRef.current = activeMap.id
    fitMap(activeMap, stageSize)
  }, [activeMap, stageSize])

  function fitMap(map: MapSummary, size: { width: number; height: number }) {
    const padding = Math.min(56, Math.max(24, size.width * 0.06))
    const availableWidth = Math.max(80, size.width - padding * 2)
    const availableHeight = Math.max(80, size.height - padding * 2)
    const scale = Math.min(availableWidth / map.width, availableHeight / map.height, 1)
    setViewport({
      scale,
      x: (size.width - map.width * scale) / 2,
      y: (size.height - map.height * scale) / 2,
    })
  }

  const fitView = useCallback(() => {
    if (!activeMap || stageSize.width === 0) return
    fitMap(activeMap, stageSize)
  }, [activeMap, stageSize])

  const zoomBy = useCallback(
    (factor: number) => {
      setViewport((previous) => {
        const nextScale = clamp(previous.scale * factor, 0.02, 12)
        const centerX = stageSize.width / 2
        const centerY = stageSize.height / 2
        const worldX = (centerX - previous.x) / previous.scale
        const worldY = (centerY - previous.y) / previous.scale
        return {
          scale: nextScale,
          x: centerX - worldX * nextScale,
          y: centerY - worldY * nextScale,
        }
      })
    },
    [stageSize],
  )

  const setZoom = useCallback(
    (nextScale: number) => {
      setViewport((previous) => {
        const scale = clamp(nextScale, 0.02, 12)
        const centerX = stageSize.width / 2
        const centerY = stageSize.height / 2
        const worldX = (centerX - previous.x) / previous.scale
        const worldY = (centerY - previous.y) / previous.scale
        return { scale, x: centerX - worldX * scale, y: centerY - worldY * scale }
      })
    },
    [stageSize],
  )

  const markChanged = useCallback(() => {
    revisionRef.current += 1
    dirtyRef.current = true
    setDirty(true)
  }, [])

  const persistProject = useCallback(async (): Promise<boolean> => {
    const id = activeIdRef.current
    if (!id) return true
    const snapshot = getSnapshot()
    const revision = revisionRef.current
    const operation = saveChainRef.current
      .catch(() => true)
      .then(async () => {
        if (id !== activeIdRef.current) return true
        setSaveState('saving')
        try {
          const project = await saveProject(id, snapshot)
          setMaps((previous) =>
            previous.map((map) =>
              map.id === id
                ? { ...map, annotations: snapshot.length, updatedAt: project.updatedAt }
                : map,
            ),
          )
          if (id === activeIdRef.current && revision === revisionRef.current) {
            dirtyRef.current = false
            setDirty(false)
            setLastSavedAt(project.updatedAt)
            setSaveState('saved')
          }
          return true
        } catch (error) {
          if (id === activeIdRef.current) {
            setSaveState('error')
            notify(error instanceof Error ? error.message : 'Impossible d’enregistrer les calques.', 'error')
          }
          return false
        }
      })
    saveChainRef.current = operation
    return operation
  }, [getSnapshot, notify])

  useEffect(() => {
    if (!dirty || !activeId) return
    const timer = window.setTimeout(() => {
      void persistProject()
    }, 850)
    return () => window.clearTimeout(timer)
  }, [annotations, dirty, activeId, persistProject])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const commitAnnotations = useCallback(
    (updater: (previous: Annotation[]) => Annotation[], group?: string) => {
      commit(updater, group ? { group } : undefined)
      markChanged()
    },
    [commit, markChanged],
  )

  const handleUndo = useCallback(() => {
    if (undo()) markChanged()
  }, [undo, markChanged])

  const handleRedo = useCallback(() => {
    if (redo()) markChanged()
  }, [redo, markChanged])

  const updateSelection = useCallback(
    (patch: Partial<Annotation>, group?: string) => {
      if (selectedIds.length === 0) return
      const ids = new Set(selectedIds)
      commitAnnotations(
        (previous) => previous.map((annotation) => (ids.has(annotation.id) ? { ...annotation, ...patch } : annotation)),
        group,
      )
    },
    [selectedIds, commitAnnotations],
  )

  const updateDrawingStyle = useCallback((patch: Partial<DrawingStyle>) => {
    setDrawingStyle((previous) => {
      const next = { ...previous, ...patch }
      try {
        localStorage.setItem(STYLE_KEY, JSON.stringify(next))
      } catch {
        // Local persistence is optional.
      }
      return next
    })
  }, [])

  const duplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    const clones = annotations
      .filter((annotation) => ids.has(annotation.id))
      .map((annotation) => ({
        ...annotation,
        id: uid(),
        x: annotation.x + 24,
        y: annotation.y + 24,
        hidden: false,
      }))
    if (clones.length === 0) return
    commitAnnotations((previous) => [...previous, ...clones])
    setSelectedIds(clones.map((annotation) => annotation.id))
    notify(`${clones.length} calque${clones.length > 1 ? 's' : ''} dupliqué${clones.length > 1 ? 's' : ''}.`)
  }, [annotations, selectedIds, commitAnnotations, notify])

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    commitAnnotations((previous) => previous.filter((annotation) => !ids.has(annotation.id)))
    setSelectedIds([])
  }, [selectedIds, commitAnnotations])

  const toggleHidden = useCallback(
    (id: string) => {
      const target = annotations.find((annotation) => annotation.id === id)
      if (!target) return
      commitAnnotations((previous) =>
        previous.map((annotation) =>
          annotation.id === id ? { ...annotation, hidden: !annotation.hidden } : annotation,
        ),
      )
      if (!target.hidden) setSelectedIds((current) => current.filter((selected) => selected !== id))
    },
    [annotations, commitAnnotations],
  )

  const saveNow = useCallback(async () => {
    const ok = await persistProject()
    if (ok) notify(t('app.savedLayers'))
    return ok
  }, [persistProject, notify, t])

  const selectMap = useCallback(
    async (id: string) => {
      if (id === activeIdRef.current) return
      if (dirtyRef.current) {
        const saved = await persistProject()
        if (!saved) {
          notify('Changement de carte annulé : la sauvegarde a échoué.', 'error')
          return
        }
      }
      setSelectedIds([])
      activeIdRef.current = id
      setActiveId(id)
    },
    [persistProject, notify],
  )

  const refreshLibrary = useCallback(async () => {
    if (dirtyRef.current) {
      const saved = await persistProject()
      if (!saved) {
        notify('Actualisation annulée : la sauvegarde a échoué.', 'error')
        return
      }
    }
    await loadLibrary('refresh')
  }, [persistProject, loadLibrary, notify])

  const handleImportProjects = useCallback(
    async (files: File[]) => {
      if (importing) return
      const projects = files.filter((file) => file.name.toLowerCase().endsWith('.wmm'))
      if (projects.length !== files.length) {
        notify(t('sidebar.onlyWmm'), 'error')
        return
      }
      setImporting(true)
      try {
        const imported = await importWmmProjects(projects)
        await loadLibrary('refresh')
        notify(t('sidebar.imported', { count: imported.length }))
      } catch (error) {
        notify(error instanceof Error ? error.message : t('sidebar.importError'), 'error')
      } finally {
        setImporting(false)
      }
    },
    [importing, loadLibrary, notify, t],
  )

  const openVersionPreview = useCallback(async () => {
    if (!activeMap) return
    try {
      setVersionPreview(await getMapVersions(activeMap.id))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible de charger les versions de la carte.', 'error')
    }
  }, [activeMap, notify])

  const requestTextEdit = useCallback((id: string) => {
    setSelectedIds([id])
    setTextFocusToken((token) => token + 1)
  }, [])

  const actionsRef = useRef({
    activeId,
    projectLoading,
    exportOpen,
    saveNow,
    handleUndo,
    handleRedo,
    duplicateSelection,
    deleteSelection,
    fitView,
    zoomBy,
    setTool,
    setSelectedIds,
    setExportOpen,
    canUndo,
    canRedo,
    selectedIds,
  })
  actionsRef.current = {
    activeId,
    projectLoading,
    exportOpen,
    saveNow,
    handleUndo,
    handleRedo,
    duplicateSelection,
    deleteSelection,
    fitView,
    zoomBy,
    setTool,
    setSelectedIds,
    setExportOpen,
    canUndo,
    canRedo,
    selectedIds,
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const actions = actionsRef.current
      const target = event.target
      const textEntry =
        target instanceof HTMLElement &&
        (target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          (target.tagName === 'INPUT' &&
            !['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset'].includes(
              (target as HTMLInputElement).type,
            )))
      const interactive =
        target instanceof HTMLElement &&
        (textEntry ||
          target.tagName === 'INPUT' ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'A' ||
          target.tagName === 'SUMMARY')
      const modifier = event.ctrlKey || event.metaKey

      if (actions.exportOpen) return

      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void actions.saveNow()
        return
      }

      if (textEntry) return

      if ((event.key === ' ' || event.code === 'Space') && !interactive) {
        event.preventDefault()
        setSpacePressed(true)
        return
      }

      if (modifier && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        if (actions.activeId && !actions.projectLoading) actions.setExportOpen(true)
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          if (actions.canRedo) actions.handleRedo()
        } else if (actions.canUndo) {
          actions.handleUndo()
        }
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        if (actions.canRedo) actions.handleRedo()
        return
      }
      if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        if (actions.selectedIds.length > 0) actions.duplicateSelection()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (actions.selectedIds.length > 0) {
          event.preventDefault()
          actions.deleteSelection()
        }
        return
      }
      if (event.key === 'Escape') {
        actions.setSelectedIds([])
        actions.setTool('select')
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        actions.fitView()
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        actions.zoomBy(1.25)
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        actions.zoomBy(0.8)
        return
      }

      const key = event.key.toLowerCase()
      const toolByKey: Partial<Record<string, Tool>> = {
        v: 'select',
        h: 'pan',
        r: 'rect',
        o: 'ellipse',
        l: 'line',
        a: 'arrow',
        t: 'text',
      }
      if (!modifier && toolByKey[key]) {
        event.preventDefault()
        actions.setTool(toolByKey[key] as Tool)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.code === 'Space') setSpacePressed(false)
    }
    const handleBlur = () => setSpacePressed(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const saveLabel =
    saveState === 'saving'
      ? t('app.saving')
      : saveState === 'error'
        ? t('app.saveError')
        : dirty
          ? t('app.changes')
          : lastSavedAt
            ? t('app.saved')
            : t('app.ready')
  const saveDotState = saveState === 'saving' ? 'saving' : saveState === 'error' ? 'error' : dirty ? 'dirty' : lastSavedAt ? 'saved' : 'idle'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <BrandLockup />
        </div>
        <div className="header-context">
          <span className="eyebrow">{t('app.activeFile')}</span>
          <code className={activeMap ? '' : 'is-empty'}>
            {activeMap ? `maps/${activeMap.file}` : t('app.noMap')}
          </code>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="save-status"
            data-state={saveDotState}
            onClick={() => void saveNow()}
            disabled={!activeMap || projectLoading || saveState === 'saving'}
            title={
              lastSavedAt
                ? `${formatDate(lastSavedAt)}. ${t('app.saveNow')}`
                : t('app.saveNow')
            }
          >
            <span className="status-dot" aria-hidden="true" />
            <span aria-live="polite">{saveLabel}</span>
          </button>
          <button
            type="button"
            className="button is-secondary"
            disabled={!activeMap || projectLoading}
            onClick={() => void openVersionPreview()}
            title={t('versions.preview')}
          >
            <Eye size={15} />
            {t('versions.preview')}
          </button>
          <button
            type="button"
            className="button is-primary"
            disabled={!activeMap || projectLoading}
            onClick={() => setExportOpen(true)}
          >
            <Download size={15} />
            {t('app.export')}
          </button>
          <button
            type="button"
            className="language-toggle"
            onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
            aria-label={`${t('language.label')}: ${language === 'fr' ? t('language.english') : t('language.french')}`}
            title={`${t('language.label')}: ${language === 'fr' ? t('language.english') : t('language.french')}`}
          >
            <UnitedKingdomFlag />
            <FranceFlag />
          </button>
        </div>
      </header>

      <div className={`workspace${activeMap ? '' : ' has-no-map'}`}>
        <Sidebar
          maps={maps}
          activeId={activeId}
          search={search}
          refreshing={refreshing}
          loading={mapsLoading}
          onSearch={setSearch}
          onSelect={(id) => void selectMap(id)}
          onRefresh={() => void refreshLibrary()}
          importing={importing}
          onImportProjects={(files) => void handleImportProjects(files)}
        />

        <main className="editor">
          <div className="editor-bar">
            {activeMap ? (
              <>
                <div className="map-heading">
                  <span className="eyebrow">{t('app.editing')}</span>
                  <h1 title={activeMap.name}>{activeMap.name}</h1>
                  <span className="map-dimensions">
                    {placeholderDimensions(activeMap.width, activeMap.height)} px
                  </span>
                </div>
                <Toolbar
                  tool={tool}
                  onToolChange={setTool}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                />
              </>
            ) : (
              <div className="map-heading">
                <span className="eyebrow">{t('app.editor')}</span>
                <h1>{t('app.noMapAvailable')}</h1>
              </div>
            )}
          </div>

          <div
            className="canvas-frame"
          >
            {activeMap ? (
              <>
                <CanvasStage
                  map={activeMap}
                  annotations={annotations}
                  selectedIds={selectedIds}
                  tool={tool}
                  spacePressed={spacePressed}
                  viewport={viewport}
                  drawingStyle={drawingStyle}
                  onViewportChange={setViewport}
                  onSizeChange={setStageSize}
                  onSelect={setSelectedIds}
                  onToolChange={setTool}
                  onBeginEdit={begin}
                  onUpdateEdit={(updater) => {
                    update(updater)
                    markChanged()
                  }}
                  onEndEdit={end}
                  onPointerWorld={setPointer}
                  onRequestTextEdit={requestTextEdit}
                />

                {projectLoading && (
                  <div className="editor-overlay">
                    <div className="overlay-card">
                      <LoaderCircle size={17} className="spin" />
                      <span>{t('app.loadingLayers')}</span>
                    </div>
                  </div>
                )}

                {projectError && !projectLoading && (
                  <div className="editor-overlay">
                    <div className="overlay-card is-error">
                      <strong>{t('app.loadError')}</strong>
                      <p>{projectError}</p>
                      <button
                        type="button"
                        className="button is-secondary"
                        onClick={() => setProjectAttempt((attempt) => attempt + 1)}
                      >
                        <RefreshCw size={14} />
                        {t('app.retry')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                {mapsLoading ? (
                  <div className="empty-loading">
                    <LoaderCircle size={20} className="spin" />
                    <span>Analyse du dossier maps</span>
                  </div>
                ) : (
                  <>
                    <EmptyMapGlyph />
                    <span className="eyebrow">{mapsError ? t('app.readError') : t('app.libraryEmpty')}</span>
                    <h2>{mapsError ? mapsError : t('sidebar.empty')}</h2>
                    <p>
                      {mapsError ??
                        t('sidebar.addToRepo')}
                    </p>
                    <div className="empty-actions">
                      <button
                        type="button"
                        className="button is-secondary"
                        onClick={() => void loadLibrary('refresh')}
                        disabled={refreshing}
                      >
                        <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
                        {t('sidebar.refresh')}
                      </button>
                    </div>
                    <div className="empty-path">
                      <span>{t('app.folder')}</span>
                      <code>maps/</code>
                      <span className="meta-separator">/</span>
                      <span>PNG, JPG, WebP</span>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>

          <footer className="status-bar">
            <div className="status-left">
              <span className="status-coordinate">
                <Crosshair size={12} />
                {pointer && activeMap
                  ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}`
                  : '—, —'}
              </span>
              <span className="status-separator" />
              <span className="status-layers">
                {annotations.length} calque{annotations.length > 1 ? 's' : ''}
              </span>
              <span className="status-hint">{activeMap ? t(TOOL_HINTS[tool]) : t('app.selectMap')}</span>
            </div>
            <div className="status-right">
              <button
                type="button"
                className="zoom-button"
                onClick={() => zoomBy(0.8)}
                disabled={!activeMap}
                aria-label={t('app.zoomOut')}
                title={t('app.zoomOut')}
              >
                <Minus size={13} />
              </button>
              <button
                type="button"
                className="zoom-value"
                onClick={() => setZoom(1)}
                disabled={!activeMap}
                title={t('app.resetZoom')}
              >
                {Math.round(viewport.scale * 100)}%
              </button>
              <button
                type="button"
                className="zoom-button"
                onClick={() => zoomBy(1.25)}
                disabled={!activeMap}
                aria-label={t('app.zoomIn')}
                title={t('app.zoomIn')}
              >
                <Plus size={13} />
              </button>
              <span className="status-separator" />
              <button
                type="button"
                className="fit-button"
                onClick={fitView}
                disabled={!activeMap}
                title={`${t('app.fit')} (0)`}
              >
                <Maximize2 size={13} />
                {t('app.fit')}
              </button>
            </div>
          </footer>
        </main>

        {activeMap && (
          <Inspector
            map={activeMap}
            annotations={annotations}
            selectedIds={selectedIds}
            drawingStyle={drawingStyle}
            textFocusToken={textFocusToken}
            onSelect={setSelectedIds}
            onUpdateSelection={updateSelection}
            onUpdateDrawingStyle={updateDrawingStyle}
            onDuplicateSelection={duplicateSelection}
            onDeleteSelection={deleteSelection}
            onToggleHidden={toggleHidden}
          />
        )}
      </div>

      {exportOpen && activeMap && (
        <ExportDialog
          map={activeMap}
          annotations={annotations}
          onClose={() => setExportOpen(false)}
          onExportDone={(message) => notify(message)}
        />
      )}

      {versionPreview && activeMap && (
        <VersionPreviewDialog
          map={activeMap}
          versions={versionPreview}
          onClose={() => setVersionPreview(null)}
        />
      )}

      {toast && (
        <div className={`toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status" key={toast.id}>
          <span className="toast-mark" aria-hidden="true" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
