import type { SeriesBible, EpisodeScript, UniversePrompt } from './types'

export interface DramaEntry {
  id: string
  title: string
  genre: string
  createdAt: string
  status: 'generating' | 'complete' | 'error'
  clipCount: number
  episodeCount: number
}

export interface DramaResult {
  videoUrls: Record<string, string>
  bible: SeriesBible
  refImages: Record<string, string>
  scripts: EpisodeScript[]
}

function readIndex(): DramaEntry[] {
  try {
    return JSON.parse(localStorage.getItem('drama_index') ?? '[]')
  } catch {
    return []
  }
}

export function getDramaIndex(): DramaEntry[] {
  if (typeof window === 'undefined') return []
  return readIndex()
}

export function upsertDramaEntry(entry: DramaEntry): void {
  if (typeof window === 'undefined') return
  const index = readIndex()
  const i = index.findIndex(e => e.id === entry.id)
  if (i >= 0) index[i] = entry
  else index.unshift(entry)
  localStorage.setItem('drama_index', JSON.stringify(index))
}

export function getDramaEntry(id: string): DramaEntry | null {
  if (typeof window === 'undefined') return null
  return readIndex().find(e => e.id === id) ?? null
}

export function getDramaInput(id: string): UniversePrompt | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`drama_${id}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getDramaResult(id: string): DramaResult | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`drama_${id}_result`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveDramaResult(id: string, result: DramaResult): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`drama_${id}_result`, JSON.stringify(result))
}
