import { useRef } from 'react'
import { FolderOpen, LoaderCircle, RefreshCw, Search, Upload } from 'lucide-react'
import type { MapSummary } from '../lib/types'
import { formatDate } from '../lib/annotations'
import { useI18n } from '../lib/i18n'

interface SidebarProps {
  maps: MapSummary[]
  activeId: string | null
  search: string
  refreshing: boolean
  importing: boolean
  loading: boolean
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onRefresh: () => void
  onImportProjects: (files: File[]) => void
}

export function Sidebar({
  maps,
  activeId,
  search,
  refreshing,
  importing,
  loading,
  onSearch,
  onSelect,
  onRefresh,
  onImportProjects,
}: SidebarProps) {
  const { t } = useI18n()
  const projectInputRef = useRef<HTMLInputElement>(null)
  const normalizedSearch = search.trim().toLocaleLowerCase('fr')
  const filteredMaps = normalizedSearch
    ? maps.filter((map) => map.name.toLocaleLowerCase('fr').includes(normalizedSearch))
    : maps

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">{t('sidebar.library')}</span>
          <h2>{t('sidebar.maps')}</h2>
        </div>
        <div className="sidebar-heading-actions">
          <span className="count-badge">{String(maps.length).padStart(2, '0')}</span>
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            disabled={refreshing}
            title={t('sidebar.refresh')}
            aria-label={t('sidebar.refresh')}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      <label className="search-field">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder={t('sidebar.search')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label={t('sidebar.search')}
        />
      </label>

      <div className="map-list" aria-busy={loading}>
        {loading && maps.length === 0 && (
          <div className="sidebar-loading">
            <LoaderCircle size={16} className="spin" />
            <span>{t('sidebar.scanning')}</span>
          </div>
        )}
        {!loading && filteredMaps.length === 0 && maps.length > 0 && (
          <p className="sidebar-empty">{t('sidebar.noMatch')}</p>
        )}
        {filteredMaps.map((map) => (
          <button
            key={map.id}
            type="button"
            className={`map-row${map.id === activeId ? ' is-active' : ''}`}
            onClick={() => onSelect(map.id)}
          >
            <span className="map-thumb">
              <img src={map.thumbUrl} alt="" loading="lazy" draggable={false} />
            </span>
            <span className="map-row-copy">
              <span className="map-row-title">{map.name}</span>
              <span className="map-row-meta">
                <span>{map.locale.toUpperCase()} · v{map.version}</span>
                <span className="meta-separator">/</span>
                {map.width} × {map.height}
                <span className="meta-separator">/</span>
                {map.annotations === 0
                  ? t('sidebar.blank')
                  : t('sidebar.layers', { count: map.annotations })}
              </span>
              <span className="map-row-date">{formatDate(map.updatedAt)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <input
          ref={projectInputRef}
          type="file"
          accept=".wmm"
          multiple
          className="visually-hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length > 0) onImportProjects(files)
          }}
        />
        <button
          type="button"
          className="button is-secondary is-wide"
          onClick={() => projectInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
          {importing ? t('sidebar.importing') : t('sidebar.import')}
        </button>
        <div className="folder-hint">
          <FolderOpen size={13} />
          <span>
            {t('sidebar.source')} <code>maps/</code>
          </span>
        </div>
        <span className="credit">Niv — <a href="https://nivmizz7.dev" target="_blank" rel="noreferrer">nivmizz7.dev</a></span>
      </div>
    </aside>
  )
}
