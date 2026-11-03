import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Layers3,
  Minus,
  MoveUpRight,
  Pipette,
  Square,
  Trash2,
  Type,
} from 'lucide-react'
import type { Annotation, DrawingStyle, FontFamily, MapSummary } from '../lib/types'
import { COLORS } from '../lib/types'
import { MAP_FONTS, mapFont, normalizeFontFamily } from '../lib/fonts'
import { useI18n } from '../lib/i18n'
import {
  annotationName,
  estimatedTextHeight,
  estimatedTextWidth,
  formatDate,
  layeredNames,
} from '../lib/annotations'

interface InspectorProps {
  map: MapSummary
  annotations: Annotation[]
  selectedIds: string[]
  drawingStyle: DrawingStyle
  textFocusToken: number
  onSelect: (ids: string[]) => void
  onUpdateSelection: (patch: Partial<Annotation>, group?: string) => void
  onUpdateDrawingStyle: (patch: Partial<DrawingStyle>) => void
  onDuplicateSelection: () => void
  onDeleteSelection: () => void
  onToggleHidden: (id: string) => void
}

function typeIcon(type: Annotation['type'], size = 14) {
  switch (type) {
    case 'rect':
      return <Square size={size} strokeWidth={1.8} />
    case 'ellipse':
      return <Circle size={size} strokeWidth={1.8} />
    case 'line':
      return <Minus size={size} strokeWidth={1.8} />
    case 'arrow':
      return <MoveUpRight size={size} strokeWidth={1.8} />
    case 'text':
      return <Type size={size} strokeWidth={1.8} />
  }
}

interface ColorControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorControl({ label, value, onChange }: ColorControlProps) {
  const { t } = useI18n()
  return (
    <div className="form-field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        <code className="field-value">{value.toUpperCase()}</code>
      </div>
      <div className="color-line">
        <div className="swatches" role="group" aria-label={label}>
          {COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`swatch${value.toLowerCase() === color.value.toLowerCase() ? ' is-active' : ''}`}
              style={{ '--swatch': color.value } as React.CSSProperties}
              onClick={() => onChange(color.value)}
              aria-label={color.name}
              title={color.name}
            />
          ))}
          <label className="swatch-custom" title={t('inspector.customColor')}>
            <Pipette size={13} />
            <input
              type="color"
              value={value}
              aria-label={t('inspector.customColor')}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function FontControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: FontFamily
  onChange: (value: FontFamily) => void
}) {
  const font = mapFont(value)
  return (
    <label className="form-field font-field">
      <span className="field-head">
        <span className="field-label">{label}</span>
        <code className="field-value">{font.label}</code>
      </span>
      <span className="font-line">
        <span
          className="font-preview"
          style={{ fontFamily: font.stack, fontWeight: font.weight }}
          aria-hidden="true"
        >
          Aa
        </span>
        <span className="select-wrap">
          <select
            value={font.family}
            onChange={(event) => onChange(normalizeFontFamily(event.target.value))}
          >
            {MAP_FONTS.map((option) => (
              <option key={option.family} value={option.family}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </span>
      </span>
    </label>
  )
}

function SliderField({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(formatPropertyValue(value))

  useEffect(() => {
    setDraft(formatPropertyValue(value))
  }, [value])

  function commitDraft(rawValue: string) {
    const parsed = Number(rawValue.trim().replace(/\s*px$/i, ''))
    if (!Number.isFinite(parsed)) {
      setDraft(formatPropertyValue(value))
      return
    }
    const next = Math.min(maximum, Math.max(minimum, parsed))
    onChange(next)
    setDraft(formatPropertyValue(next))
  }

  return (
    <label className="form-field slider-field">
      <span className="field-head">
        <span className="field-label">{label}</span>
        <span className="property-input">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            aria-label={label}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commitDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitDraft(event.currentTarget.value)
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                setDraft(formatPropertyValue(value))
                event.currentTarget.blur()
              }
            }}
          />
          {suffix && <span>{suffix}</span>}
        </span>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function formatPropertyValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function StyleControls({
  stroke,
  fill,
  fillOpacity,
  strokeWidth,
  opacity,
  colorLabel,
  showFill,
  showStrokeWidth,
  onStroke,
  onFill,
  onFillOpacity,
  onStrokeWidth,
  onOpacity,
  onToggleFill,
}: {
  stroke: string
  fill: string | null
  fillOpacity: number
  strokeWidth: number
  opacity: number
  colorLabel: string
  showFill: boolean
  showStrokeWidth: boolean
  onStroke: (value: string) => void
  onFill: (value: string) => void
  onFillOpacity: (value: number) => void
  onStrokeWidth: (value: number) => void
  onOpacity: (value: number) => void
  onToggleFill: (enabled: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <ColorControl label={colorLabel} value={stroke} onChange={onStroke} />

      {showFill && (
        <>
          <div className="form-field">
            <div className="field-head">
              <span className="field-label">{t('inspector.fill')}</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={fill !== null}
                  onChange={(event) => onToggleFill(event.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            </div>
          </div>
          {fill !== null && <ColorControl label={t('inspector.fillColor')} value={fill} onChange={onFill} />}
          {fill !== null && (
            <SliderField
              label={t('inspector.fillOpacity')}
              value={Math.round(fillOpacity * 100)}
              minimum={0}
              maximum={100}
              suffix=" %"
              onChange={(value) => onFillOpacity(value / 100)}
            />
          )}
        </>
      )}

      {showStrokeWidth && (
        <SliderField
          label={t('inspector.strokeWidth')}
          value={strokeWidth}
          minimum={0}
          maximum={20}
          suffix=" px"
          onChange={onStrokeWidth}
        />
      )}

      <SliderField
        label={t('inspector.opacity')}
        value={Math.round(opacity * 100)}
        minimum={0}
        maximum={100}
        suffix=" %"
        onChange={(value) => onOpacity(value / 100)}
      />
    </>
  )
}

export function Inspector({
  map,
  annotations,
  selectedIds,
  drawingStyle,
  textFocusToken,
  onSelect,
  onUpdateSelection,
  onUpdateDrawingStyle,
  onDuplicateSelection,
  onDeleteSelection,
  onToggleHidden,
}: InspectorProps) {
  const { t } = useI18n()
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const names = useMemo(() => layeredNames(annotations), [annotations])
  const selected = annotations.filter((annotation) => selectedIds.includes(annotation.id))
  const single = selected.length === 1 ? selected[0] : null
  const isText = single?.type === 'text'
  const textSelection = selected.find((annotation) => annotation.type === 'text') ?? null
  const showFill = single ? single.type === 'rect' || single.type === 'ellipse' : true

  useEffect(() => {
    if (textFocusToken === 0 || !isText) return
    const frame = requestAnimationFrame(() => {
      const input = textAreaRef.current
      if (!input) return
      input.focus()
      if (input.value === 'Nouveau texte') input.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [textFocusToken, isText])

  const layerRows = [...annotations].reverse()

  function handleToggleFill(enabled: boolean) {
    if (single) {
      onUpdateSelection({ fill: enabled ? single.stroke : null })
    } else {
      onUpdateDrawingStyle({ fill: enabled ? drawingStyle.stroke : null })
    }
  }

  function handleTextChange(value: string) {
    if (!single) return
    const fontSize = single.fontSize ?? 28
    onUpdateSelection(
      {
        text: value,
        w: estimatedTextWidth(value, fontSize, single.fontFamily),
        h: estimatedTextHeight(value, fontSize),
      },
      `text-${single.id}`,
    )
  }

  function handleFontSize(value: number) {
    if (!single) return
    onUpdateSelection(
      {
        fontSize: value,
        w: estimatedTextWidth(single.text ?? '', value, single.fontFamily),
        h: estimatedTextHeight(single.text ?? '', value),
      },
      `font-${single.id}`,
    )
  }

  function handleFontFamily(value: FontFamily) {
    if (!single) return
    const fontSize = single.fontSize ?? 28
    onUpdateSelection(
      {
        fontFamily: value,
        w: estimatedTextWidth(single.text ?? '', fontSize, value),
      },
      `font-${single.id}`,
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">{t('inspector.panel')}</span>
          <h2>{t('inspector.title')}</h2>
        </div>
      </div>

      <div className="inspector-scroll">
        {single ? (
          <section className="panel-section selection-panel">
            <div className="selection-heading">
              <div className="selection-identity">
                <span className="selection-icon" style={{ color: single.stroke }}>
                  {typeIcon(single.type, 16)}
                </span>
                <div>
                  <h3>{names.get(single.id) ?? annotationName(single)}</h3>
                  <span className="selection-type">{t(`type.${single.type}`)}</span>
                </div>
              </div>
              <div className="mini-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={onDuplicateSelection}
                  title={`${t('inspector.duplicate')} (Ctrl+D)`}
                  aria-label={t('inspector.duplicate')}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button is-danger"
                  onClick={onDeleteSelection}
                  title={`${t('inspector.delete')} (Suppr)`}
                  aria-label={t('inspector.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {isText && (
              <>
                <label className="form-field">
                  <span className="field-label">{t('inspector.content')}</span>
                  <textarea
                    ref={textAreaRef}
                    rows={2}
                    value={single.text ?? ''}
                    onChange={(event) => handleTextChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.currentTarget.blur()
                      }
                    }}
                    placeholder={t('inspector.placeholder')}
                  />
                </label>
                <FontControl
                  label={t('inspector.font')}
                  value={mapFont(single.fontFamily).family}
                  onChange={handleFontFamily}
                />
                <SliderField
                  label={t('inspector.textSize')}
                  value={single.fontSize ?? 28}
                  minimum={10}
                  maximum={96}
                  suffix=" px"
                  onChange={handleFontSize}
                />
              </>
            )}

            <StyleControls
              stroke={single.stroke}
              fill={single.fill}
              fillOpacity={single.fillOpacity}
              strokeWidth={single.strokeWidth}
              opacity={single.opacity}
              colorLabel={isText ? t('inspector.textColor') : t('inspector.strokeColor')}
              showFill={showFill}
              showStrokeWidth={!isText}
              onStroke={(value) => onUpdateSelection({ stroke: value }, `stroke-${single.id}`)}
              onFill={(value) => onUpdateSelection({ fill: value }, `fill-${single.id}`)}
              onFillOpacity={(value) => onUpdateSelection({ fillOpacity: value }, `fill-opacity-${single.id}`)}
              onStrokeWidth={(value) => onUpdateSelection({ strokeWidth: value }, `width-${single.id}`)}
              onOpacity={(value) => onUpdateSelection({ opacity: value }, `opacity-${single.id}`)}
              onToggleFill={handleToggleFill}
            />
          </section>
        ) : selected.length > 1 ? (
          <section className="panel-section selection-panel">
            <div className="selection-heading">
              <div className="selection-identity">
                <span className="selection-icon">
                  <Layers3 size={16} />
                </span>
                <div>
                  <h3>{t('inspector.multiple', { count: selected.length })}</h3>
                  <span className="selection-type">{t('inspector.multipleType')}</span>
                </div>
              </div>
              <div className="mini-actions">
                <button type="button" className="icon-button" onClick={onDuplicateSelection} title={t('inspector.duplicate')}>
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button is-danger"
                  onClick={onDeleteSelection}
                  title={t('inspector.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="panel-note">{t('inspector.multipleNote')}</p>
            <StyleControls
              stroke={selected[0].stroke}
              fill={null}
              fillOpacity={drawingStyle.fillOpacity}
              strokeWidth={Math.max(...selected.map((annotation) => annotation.strokeWidth))}
              opacity={selected[0].opacity}
              colorLabel={t('inspector.strokeColor')}
              showFill={false}
              showStrokeWidth
              onStroke={(value) => onUpdateSelection({ stroke: value }, 'multi-stroke')}
              onFill={() => undefined}
              onFillOpacity={() => undefined}
              onStrokeWidth={(value) => onUpdateSelection({ strokeWidth: value }, 'multi-width')}
              onOpacity={(value) => onUpdateSelection({ opacity: value }, 'multi-opacity')}
              onToggleFill={() => undefined}
            />
            {textSelection && (
              <FontControl
                label={t('inspector.fonts')}
                value={mapFont(textSelection.fontFamily).family}
                onChange={(fontFamily) => onUpdateSelection({ fontFamily }, 'multi-font')}
              />
            )}
          </section>
        ) : (
          <>
            <section className="panel-section">
              <div className="section-title">
                <h3>{t('inspector.newDrawing')}</h3>
                <span className="section-meta">{t('inspector.defaults')}</span>
              </div>
              <StyleControls
                stroke={drawingStyle.stroke}
                fill={drawingStyle.fill}
                fillOpacity={drawingStyle.fillOpacity}
                strokeWidth={drawingStyle.strokeWidth}
                opacity={drawingStyle.opacity}
                colorLabel={t('inspector.color')}
                showFill
                showStrokeWidth
                onStroke={(value) => onUpdateDrawingStyle({ stroke: value })}
                onFill={(value) => onUpdateDrawingStyle({ fill: value })}
                onFillOpacity={(value) => onUpdateDrawingStyle({ fillOpacity: value })}
                onStrokeWidth={(value) => onUpdateDrawingStyle({ strokeWidth: value })}
                onOpacity={(value) => onUpdateDrawingStyle({ opacity: value })}
                onToggleFill={handleToggleFill}
              />
              <FontControl
                label={t('inspector.fonts')}
                value={drawingStyle.fontFamily}
                onChange={(fontFamily) => onUpdateDrawingStyle({ fontFamily })}
              />
            </section>

            <section className="panel-section map-source">
              <div className="section-title">
                <h3>{t('inspector.sourceMap')}</h3>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>{t('inspector.file')}</dt>
                  <dd title={map.file}>{map.file}</dd>
                </div>
                <div>
                  <dt>{t('inspector.dimensions')}</dt>
                  <dd>
                    {map.width} × {map.height} px
                  </dd>
                </div>
                <div>
                  <dt>{t('inspector.annotations')}</dt>
                  <dd>{annotations.length}</dd>
                </div>
                <div>
                  <dt>{t('inspector.savedAt')}</dt>
                  <dd>{formatDate(map.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            <details className="shortcuts-panel">
              <summary>Raccourcis clavier</summary>
              <dl>
                <div><dt>V / H</dt><dd>{t('shortcuts.select')}</dd></div>
                <div><dt>R / O</dt><dd>{t('shortcuts.rect')}</dd></div>
                <div><dt>L / A</dt><dd>{t('shortcuts.line')}</dd></div>
                <div><dt>T</dt><dd>{t('shortcuts.text')}</dd></div>
                <div><dt>Espace</dt><dd>Déplacer la vue</dd></div>
                <div><dt>Molette</dt><dd>Zoom sous le curseur</dd></div>
                <div><dt>Ctrl Z</dt><dd>{t('shortcuts.undo')}</dd></div>
                <div><dt>Ctrl D</dt><dd>{t('shortcuts.duplicate')}</dd></div>
                <div><dt>Suppr</dt><dd>{t('shortcuts.delete')}</dd></div>
              </dl>
            </details>
          </>
        )}

        <section className="panel-section layers-panel">
          <div className="section-title">
            <h3>{t('inspector.layers')}</h3>
            <span className="section-meta">{String(annotations.length).padStart(2, '0')}</span>
          </div>
          {layerRows.length === 0 ? (
            <p className="panel-note">
              {t('inspector.noLayers')}
            </p>
          ) : (
            <div className="layer-list">
              {layerRows.map((annotation) => (
                <div
                  key={annotation.id}
                  className={`layer-row${selectedIds.includes(annotation.id) ? ' is-selected' : ''}${
                    annotation.hidden ? ' is-hidden' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="layer-main"
                    onClick={(event) => {
                      if (event.shiftKey) {
                        onSelect(
                          selectedIds.includes(annotation.id)
                            ? selectedIds.filter((id) => id !== annotation.id)
                            : [...selectedIds, annotation.id],
                        )
                      } else {
                        onSelect([annotation.id])
                      }
                    }}
                  >
                    <span className="layer-color" style={{ background: annotation.stroke }} />
                    <span className="layer-icon">{typeIcon(annotation.type, 13)}</span>
                    <span className="layer-name">{names.get(annotation.id)}</span>
                  </button>
                  <button
                    type="button"
                    className="layer-visibility"
                    onClick={() => onToggleHidden(annotation.id)}
                    title={annotation.hidden ? t('inspector.showLayer') : t('inspector.hideLayer')}
                    aria-label={annotation.hidden ? t('inspector.showLayer') : t('inspector.hideLayer')}
                  >
                    {annotation.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
