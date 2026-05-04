'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDramaIndex } from '@/lib/dramaStore'
import type { DramaEntry } from '@/lib/dramaStore'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function StatusBadge({ status }: { status: DramaEntry['status'] }) {
  if (status === 'complete') {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-950/60 text-green-400 border border-green-900">
        Complete
      </span>
    )
  }
  if (status === 'generating') {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-950/60 text-yellow-400 border border-yellow-900 animate-pulse">
        Generating…
      </span>
    )
  }
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-900">
      Error
    </span>
  )
}

function DramaCard({ entry }: { entry: DramaEntry }) {
  const router = useRouter()
  const href = entry.status === 'generating'
    ? `/generate/${entry.id}`
    : `/drama/${entry.id}`

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white text-base leading-tight truncate group-hover:text-zinc-100">
            {entry.title}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{entry.genre}</p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-600">
        {entry.episodeCount > 0 && (
          <span>{entry.episodeCount} ep{entry.episodeCount !== 1 ? 's' : ''}</span>
        )}
        {entry.clipCount > 0 && (
          <span>{entry.clipCount} clips</span>
        )}
        <span className="ml-auto">{formatDate(entry.createdAt)}</span>
      </div>

      <button
        onClick={() => router.push(href)}
        className="w-full text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg transition-colors text-left flex items-center justify-between"
      >
        <span>{entry.status === 'generating' ? 'View Progress' : 'View Series'}</span>
        <span>→</span>
      </button>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [dramas, setDramas] = useState<DramaEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setDramas(getDramaIndex())
    setLoaded(true)
  }, [])

  const ongoing = dramas.filter(d => d.status === 'generating')
  const completed = dramas.filter(d => d.status === 'complete')
  const failed = dramas.filter(d => d.status === 'error')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-red-700 rounded flex items-center justify-center text-white text-[11px] font-bold tracking-tight">
            DG
          </div>
          <span className="font-mono text-xs tracking-widest uppercase text-zinc-400">
            Drama Generator
          </span>
        </div>
        <button
          onClick={() => router.push('/new')}
          className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Drama
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">Your Series</h1>
          <p className="text-zinc-500 text-sm">
            {dramas.length === 0 ? 'No series yet — create your first one.' : `${dramas.length} series total · ${completed.length} complete · ${ongoing.length} in progress`}
          </p>
        </div>

        {/* Empty state */}
        {loaded && dramas.length === 0 && (
          <div className="border border-dashed border-zinc-800 rounded-2xl p-16 text-center">
            <p className="text-zinc-600 font-mono text-sm mb-2">No dramas yet</p>
            <p className="text-zinc-700 text-xs mb-6">Create your first AI drama series to get started.</p>
            <button
              onClick={() => router.push('/new')}
              className="bg-red-700 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              + Create New Drama Series
            </button>
          </div>
        )}

        {/* Ongoing */}
        {ongoing.length > 0 && (
          <section className="mb-10">
            <p className="font-mono text-[11px] uppercase tracking-widest text-yellow-600 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
              Generating Now
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ongoing.map(d => <DramaCard key={d.id} entry={d} />)}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section className="mb-10">
            <p className="font-mono text-[11px] uppercase tracking-widest text-green-600 mb-4">
              Completed
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map(d => <DramaCard key={d.id} entry={d} />)}
            </div>
          </section>
        )}

        {/* Failed */}
        {failed.length > 0 && (
          <section className="mb-10">
            <p className="font-mono text-[11px] uppercase tracking-widest text-red-700 mb-4">
              Stopped
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {failed.map(d => <DramaCard key={d.id} entry={d} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
