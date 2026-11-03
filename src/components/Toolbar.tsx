import {
  Circle,
  Hand,
  Minus,
  MousePointer2,
  MoveUpRight,
  Redo2,
  Square,
  Type,
  Undo2,
} from 'lucide-react'
import type { Tool } from '../lib/types'
import { useI18n } from '../lib/i18n'

interface ToolbarProps {
  tool: Tool
  onToolChange: (tool: Tool) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const tools: Array<{ id: Tool; key: string; shortcut: string; icon: typeof MousePointer2 }> = [
  { id: 'select', key: 'tool.select', shortcut: 'V', icon: MousePointer2 },
  { id: 'pan', key: 'tool.pan', shortcut: 'H', icon: Hand },
  { id: 'rect', key: 'tool.rect', shortcut: 'R', icon: Square },
  { id: 'ellipse', key: 'tool.ellipse', shortcut: 'O', icon: Circle },
  { id: 'line', key: 'tool.line', shortcut: 'L', icon: Minus },
  { id: 'arrow', key: 'tool.arrow', shortcut: 'A', icon: MoveUpRight },
  { id: 'text', key: 'tool.text', shortcut: 'T', icon: Type },
]

export function Toolbar({
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const { t } = useI18n()
  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.tools')}>
      <div className="tool-group">
        {tools.slice(0, 2).map((item) => {
          const Icon = item.icon
          const label = t(item.key)
          return (
            <button
              key={item.id}
              type="button"
              className={`tool-button${tool === item.id ? ' is-active' : ''}`}
              onClick={() => onToolChange(item.id)}
              aria-label={`${label} (${item.shortcut})`}
              aria-pressed={tool === item.id}
              data-tooltip={`${label} · ${item.shortcut}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span className="tool-label">{label}</span>
            </button>
          )
        })}
      </div>
      <span className="tool-separator" />
      <div className="tool-group">
        {tools.slice(2).map((item) => {
          const Icon = item.icon
          const label = t(item.key)
          return (
            <button
              key={item.id}
              type="button"
              className={`tool-button${tool === item.id ? ' is-active' : ''}`}
              onClick={() => onToolChange(item.id)}
              aria-label={`${label} (${item.shortcut})`}
              aria-pressed={tool === item.id}
              data-tooltip={`${label} · ${item.shortcut}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span className="tool-label">{label}</span>
            </button>
          )
        })}
      </div>
      <span className="tool-separator" />
      <div className="tool-group">
        <button
          type="button"
          className="tool-button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={`${t('action.undo')} (Ctrl+Z)`}
          data-tooltip={`${t('action.undo')} · Ctrl Z`}
        >
          <Undo2 size={17} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={`${t('action.redo')} (Ctrl+Maj+Z)`}
          data-tooltip={`${t('action.redo')} · Ctrl Maj Z`}
        >
          <Redo2 size={17} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
