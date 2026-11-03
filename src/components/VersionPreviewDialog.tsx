import { useEffect, useRef, useState } from 'react'
import { Eye, LoaderCircle, X } from 'lucide-react'
import type { MapSummary, MapVersion } from '../lib/types'
import { useI18n } from '../lib/i18n'

interface VersionPreviewDialogProps {
  map: MapSummary
  versions: MapVersion[]
  onClose: () => void
}

export function VersionPreviewDialog({ map, versions, onClose }: VersionPreviewDialogProps) {
  const { t } = useI18n()
  const [comparisonFile, setComparisonFile] = useState(versions.find((item) => item.file !== map.file)?.file ?? '')
  const [opacity, setOpacity] = useState(0.5)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const comparison = versions.find((item) => item.file === comparisonFile)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="dialog version-dialog" role="dialog" aria-modal="true" aria-labelledby="version-preview-title">
        <header className="dialog-head">
          <div>
            <span className="eyebrow">{t('versions.preview')}</span>
            <h2 id="version-preview-title">{t('versions.title')}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label={t('export.cancel')}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-body">
          <div className="version-toolbar">
            <label>
              <span className="field-label">{t('versions.compare')}</span>
              <select value={comparisonFile} onChange={(event) => setComparisonFile(event.target.value)}>
                {versions.filter((item) => item.file !== map.file).map((item) => (
                  <option key={item.file} value={item.file}>v{item.version} — {item.file}</option>
                ))}
              </select>
            </label>
            <label className="version-opacity">
              <span className="field-label">{t('versions.opacity')}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="version-preview" style={{ aspectRatio: `${map.width} / ${map.height}` }}>
            <img src={map.url} alt={`${map.name} v${map.version}`} />
            {comparison && <img className="version-preview-overlay" src={comparison.url} alt={`${comparison.name} v${comparison.version}`} style={{ opacity }} />}
            {!comparison && <div className="version-empty"><LoaderCircle size={16} />{t('versions.none')}</div>}
            <span className="version-label current">v{map.version}</span>
            {comparison && <span className="version-label previous">v{comparison.version}</span>}
          </div>
          <p className="dialog-note"><Eye size={14} /> {t('versions.note')}</p>
        </div>
      </div>
    </div>
  )
}
