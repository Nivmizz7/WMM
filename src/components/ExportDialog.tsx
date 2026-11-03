import { useEffect, useRef, useState } from 'react'
import { Braces, Download, FileCode2, FileImage, LoaderCircle, X } from 'lucide-react'
import type { Annotation, MapSummary } from '../lib/types'
import {
  downloadJson,
  downloadPng,
  downloadSvg,
} from '../lib/exporter'
import { estimatedTextHeight } from '../lib/annotations'
import { useI18n } from '../lib/i18n'

type ExportFormat = 'png' | 'svg' | 'json'

interface ExportDialogProps {
  map: MapSummary
  annotations: Annotation[]
  onClose: () => void
  onExportDone: (message: string) => void
}

const formats: Array<{
  id: ExportFormat
  labelKey: string
  descriptionKey: string
  icon: typeof FileImage
}> = [
  {
    id: 'png',
    labelKey: 'export.png',
    descriptionKey: 'export.pngDesc',
    icon: FileImage,
  },
  {
    id: 'svg',
    labelKey: 'export.svg',
    descriptionKey: 'export.svgDesc',
    icon: FileCode2,
  },
  {
    id: 'json',
    labelKey: 'export.json',
    descriptionKey: 'export.jsonDesc',
    icon: Braces,
  },
]

export function ExportDialog({
  map,
  annotations,
  onClose,
  onExportDone,
}: ExportDialogProps) {
  const { t } = useI18n()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [includeMap, setIncludeMap] = useState(true)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const visibleCount = annotations.filter((annotation) => !annotation.hidden).length
  const maximumScale = Math.sqrt(80_000_000 / (map.width * map.height))
  const effectiveScale = Math.min(scale, maximumScale)
  const outputWidth = Math.round(map.width * effectiveScale)
  const outputHeight = Math.round(map.height * effectiveScale)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, onClose])

  async function handleDownload() {
    setError(null)
    setBusy(true)
    try {
      if (format === 'json') {
        const filename = downloadJson({ map, annotations, includeMap })
        onExportDone(t('app.exported', { kind: 'WMM', name: filename }))
      } else if (format === 'svg') {
        const filename = await downloadSvg({ map, annotations, includeMap })
        onExportDone(t('app.exported', { kind: 'SVG', name: filename }))
      } else {
        const result = await downloadPng({ map, annotations, includeMap }, scale)
        onExportDone(t('app.exported', { kind: 'PNG', name: result.filename }))
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('export.failed'))
    } finally {
      setBusy(false)
    }
  }

  const actionLabel =
    format === 'png' ? t('export.downloadPng') : format === 'svg' ? t('export.downloadSvg') : t('export.exportJson')

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="dialog-head">
          <div>
            <span className="eyebrow">{t('export.output')}</span>
            <h2 id="export-title">{t('export.title')}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('export.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="dialog-body">
          <div className="export-summary">
            <div>
              <span className="eyebrow">{t('export.map')}</span>
              <strong>{map.name}</strong>
            </div>
            <div className="export-summary-meta">
              <span>{map.width} × {map.height} px</span>
              <span className="meta-separator">/</span>
              <span>{visibleCount} calque{visibleCount > 1 ? 's' : ''} visible{visibleCount > 1 ? 's' : ''}</span>
            </div>
          </div>

          <fieldset className="format-grid">
            <legend className="visually-hidden">{t('export.format')}</legend>
            {formats.map((item) => {
              const Icon = item.icon
              return (
                <label key={item.id} className={`format-option${format === item.id ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="export-format"
                    value={item.id}
                    checked={format === item.id}
                    onChange={() => setFormat(item.id)}
                  />
                  <Icon size={18} strokeWidth={1.7} />
                  <span>
                    <strong>{t(item.labelKey)}</strong>
                    <small>{t(item.descriptionKey)}</small>
                  </span>
                </label>
              )
            })}
          </fieldset>

          {format !== 'json' && (
            <div className="export-options">
              <label className="option-row">
                <span>
                  <strong>{t('export.includeMap')}</strong>
                  <small>
                    {includeMap
                      ? t('export.mapIncluded')
                      : t('export.layersOnly')}
                  </small>
                </span>
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={includeMap}
                    onChange={(event) => setIncludeMap(event.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true" />
                </span>
              </label>

              {format === 'png' && (
                <div className="option-block">
                  <div className="option-label">
                    <strong>{t('export.resolution')}</strong>
                    <span>
                      {outputWidth} × {outputHeight} px
                      {effectiveScale < scale ? ` — ${t('export.capped')}` : ''}
                    </span>
                  </div>
                  <div className="segmented">
                    <button
                      type="button"
                      className={scale === 1 ? 'is-active' : ''}
                      onClick={() => setScale(1)}
                    >
                      {t('export.source')} <span>1×</span>
                    </button>
                    <button
                      type="button"
                      className={scale === 2 ? 'is-active' : ''}
                      onClick={() => setScale(2)}
                    >
                      {t('export.double')} <span>2×</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {format === 'json' && (
            <p className="dialog-note">
              {t('export.jsonNote')}
            </p>
          )}

          {error && <div className="dialog-error" role="alert">{error}</div>}

        </div>

        <footer className="dialog-foot">
          <div className="dialog-actions">
            <button type="button" className="button is-ghost" onClick={onClose} disabled={busy}>
              {t('export.cancel')}
            </button>
            <button type="button" className="button is-primary" onClick={handleDownload} disabled={busy}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
              {busy ? t('export.generate') : actionLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// Keep the trim helper close to the export surface if annotation sizing evolves.
export function annotationBoxHeight(annotation: Annotation): number {
  return estimatedTextHeight(annotation.text ?? '', annotation.fontSize ?? 28)
}
