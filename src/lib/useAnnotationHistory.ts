import { useCallback, useRef, useState } from 'react'
import type { Annotation } from './types'

type AnnotationUpdater = Annotation[] | ((previous: Annotation[]) => Annotation[])

interface CommitOptions {
  group?: string
}

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  annotations: Annotation[]
}

const HISTORY_LIMIT = 100
const GROUP_WINDOW = 700

function resolve(updater: AnnotationUpdater, previous: Annotation[]): Annotation[] {
  return typeof updater === 'function' ? updater(previous) : updater
}

export function useAnnotationHistory() {
  const annotationsRef = useRef<Annotation[]>([])
  const [state, setState] = useState<HistoryState>({ canUndo: false, canRedo: false, annotations: [] })
  const undoRef = useRef<Annotation[][]>([])
  const redoRef = useRef<Annotation[][]>([])
  const transactionRef = useRef<{ before: Annotation[]; changed: boolean } | null>(null)
  const groupRef = useRef<{ name: string; at: number } | null>(null)

  const sync = useCallback((annotations: Annotation[]) => {
    annotationsRef.current = annotations
    setState({ annotations, canUndo: undoRef.current.length > 0, canRedo: redoRef.current.length > 0 })
  }, [])

  const pushUndo = useCallback((snapshot: Annotation[]) => {
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), snapshot]
    redoRef.current = []
    groupRef.current = null
  }, [])

  const reset = useCallback(
    (annotations: Annotation[]) => {
      undoRef.current = []
      redoRef.current = []
      transactionRef.current = null
      groupRef.current = null
      annotationsRef.current = annotations
      setState({ annotations, canUndo: false, canRedo: false })
    },
    [],
  )

  const commit = useCallback(
    (updater: AnnotationUpdater, options?: CommitOptions) => {
      const previous = annotationsRef.current
      const next = resolve(updater, previous)
      if (next === previous) return
      const now = Date.now()
      const group = options?.group
      const canCoalesce =
        group !== undefined && groupRef.current?.name === group && now - groupRef.current.at < GROUP_WINDOW
      if (!canCoalesce) pushUndo(previous)
      groupRef.current = group ? { name: group, at: now } : null
      sync(next)
    },
    [pushUndo, sync],
  )

  const begin = useCallback(() => {
    transactionRef.current = { before: annotationsRef.current, changed: false }
    groupRef.current = null
  }, [])

  const update = useCallback(
    (updater: AnnotationUpdater) => {
      const previous = annotationsRef.current
      const next = resolve(updater, previous)
      if (next === previous) return
      if (transactionRef.current) transactionRef.current.changed = true
      sync(next)
    },
    [sync],
  )

  const end = useCallback(() => {
    const transaction = transactionRef.current
    transactionRef.current = null
    if (!transaction?.changed) return
    const current = annotationsRef.current
    if (transaction.before !== current) {
      undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), transaction.before]
      redoRef.current = []
      groupRef.current = null
      setState({ annotations: current, canUndo: true, canRedo: false })
    }
  }, [])

  const cancel = useCallback(() => {
    const transaction = transactionRef.current
    transactionRef.current = null
    if (transaction) sync(transaction.before)
  }, [sync])

  const undo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (!previous) return false
    redoRef.current.push(annotationsRef.current)
    sync(previous)
    return true
  }, [sync])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return false
    undoRef.current.push(annotationsRef.current)
    sync(next)
    return true
  }, [sync])

  const getSnapshot = useCallback(() => annotationsRef.current, [])

  return {
    annotations: state.annotations,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    reset,
    commit,
    begin,
    update,
    end,
    cancel,
    undo,
    redo,
    getSnapshot,
  }
}
