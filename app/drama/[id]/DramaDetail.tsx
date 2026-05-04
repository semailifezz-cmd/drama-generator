'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDramaInput, getDramaResult, getDramaEntry } from '@/lib/dramaStore'
import type { DramaEntry } from '@/lib/dramaStore'
import type { UniversePrompt, SeriesBible, EpisodeScript } from '@/lib/types'
import { sleep } from '@/lib/workflow'

async function downloadVideo(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

type Tab = 'overview' | 'bible' | 'media' | 'settings'

function VideoCard({
  epNum, clipNum, url, seriesTitle,
}: {
  epNum: number; clipNum: number; url: string; seriesTitle: string
}) {
  const [downloading, setDownloading] = useState(false)
  const handleDownload = async () => {
    setDownloading(true)
    await downloadVideo(url, `${seriesTitle.replace(/\s+/g, '_')}_Ep${epNum}_Clip${clipNum}.mp4`)
    setDownloading(false)
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="relative bg-black" style={{ aspectRatio: '9/16' }}>
        <video src={url} controls playsInline className="w-full h-full object-contain" preload="metadata" />
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <p className="text-xs font-mono text-zinc-300 font-semibold">Clip {clipNum}</p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {downloading ? '…' : '↓ MP4'}
        </button>
      </div>
    </div>
  )
}

export default function DramaDetail({ id }: { id: string }) {
  const router = useRouter()
  const [entry, setEntry] = useState<DramaEntry | null>(null)
  const [input, setInput] = useState<UniversePrompt | null>(null)
  const [bible, setBible] = useState<SeriesBible | null>(null)
  const [refImages, setRefImages] = useState<Record<string, string>>({})
  const [scripts, setScripts] = useState<EpisodeScript[]>([])
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    const e = getDramaEntry(id)
    const inp = getDramaInput(id)
    if (!inp) { setNotFound(true); return }

    setEntry(e)
    setInput(inp)

    const result = getDramaResult(id)
    if (result) {
      setBible(result.bible)
      setRefImages(result.refImages ?? {})
      setScripts(result.scripts ?? [])
      setVideoUrls(result.videoUrls ?? {})
    }
  }, [id])

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <p className="text-lg mb-4">Series not found.</p>
          <button onClick={() => router.push('/')} className="text-red-500 hover:text-red-400">← Dashboard</button>
        </div>
      </div>
    )
  }

  const totalClips = Object.keys(videoUrls).length
  const isComplete = entry?.status === 'complete'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'bible', label: 'Series Bible' },
    { id: 'media', label: `Media (${totalClips} clips)` },
    { id: 'settings', label: 'Input Settings' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/60 px-6 py-4 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors flex-shrink-0">
            ← Dashboard
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">{input?.genre}</p>
            <p className="text-base font-bold text-white truncate">{input?.series_title || 'Untitled'}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isComplete && (
              <button
                onClick={() => router.push(`/drama/${id}/extend`)}
                className="text-sm bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                + More Episodes
              </button>
            )}
            {entry?.status === 'complete' && (
              <span className="text-xs font-mono text-green-400 bg-green-950/50 border border-green-900 px-3 py-1 rounded-full">Complete</span>
            )}
            {entry?.status === 'generating' && (
              <span className="text-xs font-mono text-yellow-400 bg-yellow-950/50 border border-yellow-900 px-3 py-1 rounded-full animate-pulse">Generating</span>
            )}
            {entry?.status === 'error' && (
              <span className="text-xs font-mono text-red-400 bg-red-950/50 border border-red-900 px-3 py-1 rounded-full">Stopped</span>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-zinc-800/60 px-6">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-mono whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? 'text-white border-red-600'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Episodes', value: bible?.episodes.length ?? entry?.episodeCount ?? '—' },
                { label: 'Clips', value: totalClips || '—' },
                { label: 'Characters', value: bible?.characters.length ?? '—' },
                { label: 'Venues', value: bible?.venues.length ?? '—' },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Arc */}
            {bible?.overall_arc && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-3">Series Arc</p>
                <p className="text-zinc-300 leading-relaxed">{bible.overall_arc}</p>
              </div>
            )}

            {/* Episode list */}
            {bible && bible.episodes.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                  Episodes ({bible.episodes.length})
                </p>
                <div className="space-y-3">
                  {bible.episodes.map(ep => {
                    const clips = [1, 2, 3, 4].filter(c => videoUrls[`ep${ep.ep_num}_clip${c}`])
                    return (
                      <div key={ep.ep_num} className="flex items-start gap-4 py-3 border-b border-zinc-800 last:border-0">
                        <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-mono text-zinc-400 flex-shrink-0 mt-0.5">
                          {ep.ep_num}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{ep.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{ep.summary}</p>
                          <p className="text-[10px] font-mono text-zinc-600 mt-1">
                            {ep.characters_featured.join(', ')}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-[10px] font-mono text-zinc-600">
                          {clips.length}/4 clips
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Generate more CTA if no result yet */}
            {isComplete && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">Want more episodes?</p>
                  <p className="text-sm text-zinc-500 mt-0.5">Continue the story using existing characters, venues, and visual style.</p>
                </div>
                <button
                  onClick={() => router.push(`/drama/${id}/extend`)}
                  className="flex-shrink-0 bg-red-700 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
                >
                  + Generate More Episodes
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bible tab */}
        {tab === 'bible' && bible && (
          <div className="space-y-6">
            {/* Characters */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-5">
                Characters ({bible.characters.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {bible.characters.map(c => (
                  <div key={c.name} className="bg-zinc-800/40 rounded-xl p-4 flex gap-4">
                    {refImages[c.name] && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={refImages[c.name]} alt={c.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white text-sm">{c.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          c.role === 'protagonist' ? 'bg-red-950/60 text-red-400 border border-red-900/60'
                          : c.role === 'antagonist' ? 'bg-zinc-700 text-zinc-300'
                          : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {c.role}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{c.personality}</p>
                      <p className="text-[11px] text-zinc-600 mt-1">{c.physical_description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Venues */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-5">
                Venues ({bible.venues.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {bible.venues.map(v => (
                  <div key={v.location_name} className="bg-zinc-800/40 rounded-xl p-4 flex gap-4">
                    {refImages[v.location_name] && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={refImages[v.location_name]} alt={v.location_name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm mb-1">{v.location_name}</p>
                      <p className="text-xs text-zinc-400">{v.style} · {v.lighting}</p>
                      <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2">{v.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Props */}
            {bible.props.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">Props ({bible.props.length})</p>
                <div className="space-y-2">
                  {bible.props.map(p => (
                    <div key={p.prop_name} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <p className="text-sm font-semibold text-white w-40 flex-shrink-0">{p.prop_name}</p>
                      <p className="text-xs text-zinc-500">{p.visual_desc} — owned by {p.owner_character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Media tab */}
        {tab === 'media' && (
          <div className="space-y-6">
            {/* Reference images */}
            {Object.keys(refImages).length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                  Reference Images ({Object.keys(refImages).length})
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
                  {Object.entries(refImages).map(([name, url]) => (
                    <div key={name} className="aspect-square bg-zinc-800 rounded-lg overflow-hidden relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={name} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <p className="text-[10px] text-white font-medium truncate">{name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Videos by episode */}
            {bible && totalClips > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                    Generated Videos ({totalClips} clips)
                  </p>
                  <button
                    onClick={async () => {
                      for (const [key, url] of Object.entries(videoUrls)) {
                        const [ep, clip] = key.replace('ep', 'Ep').replace('_clip', '_Clip').split('_')
                        await downloadVideo(url, `${(input?.series_title ?? 'Series').replace(/\s+/g, '_')}_${ep}_${clip}.mp4`)
                        await sleep(400)
                      }
                    }}
                    className="text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors"
                  >
                    ↓ Download All {totalClips} Clips
                  </button>
                </div>
                {bible.episodes.map(ep => {
                  const epClips = [1, 2, 3, 4]
                    .map(c => ({ clip: c, url: videoUrls[`ep${ep.ep_num}_clip${c}`] }))
                    .filter(c => !!c.url)
                  if (epClips.length === 0) return null
                  return (
                    <div key={ep.ep_num} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Episode {ep.ep_num}</p>
                          <h3 className="text-base font-bold text-white mt-0.5">{ep.title}</h3>
                          <p className="text-xs text-zinc-500 mt-1 max-w-xl">{ep.summary}</p>
                        </div>
                        <button
                          onClick={async () => {
                            for (const { clip, url } of epClips) {
                              await downloadVideo(url, `${(input?.series_title ?? 'Series').replace(/\s+/g, '_')}_Ep${ep.ep_num}_Clip${clip}.mp4`)
                              await sleep(300)
                            }
                          }}
                          className="flex-shrink-0 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors"
                        >
                          ↓ All {epClips.length} clips
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {epClips.map(({ clip, url }) => (
                          <VideoCard key={clip} epNum={ep.ep_num} clipNum={clip} url={url} seriesTitle={input?.series_title ?? 'Series'} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scene scripts */}
            {scripts.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                  Scene Scripts ({scripts.reduce((n, s) => n + s.scenes.length, 0)} scenes)
                </p>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {scripts.map(ep => (
                    <div key={ep.ep_num}>
                      <p className="text-[11px] font-mono text-zinc-400 font-semibold mb-2">Episode {ep.ep_num}</p>
                      <div className="space-y-2">
                        {ep.scenes.map(scene => (
                          <div key={scene.clip_num} className="bg-zinc-800/40 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-mono bg-red-950/50 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded">
                                Clip {scene.clip_num}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-600">Step {scene.formula_step} · {scene.venue_used}</span>
                              <span className="text-[10px] font-mono text-zinc-600 ml-auto">{scene.characters_used?.join(', ')}</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">{scene.raw_prompt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalClips === 0 && Object.keys(refImages).length === 0 && (
              <div className="text-center py-16 text-zinc-600">
                <p className="font-mono text-sm">No media generated yet.</p>
                {entry?.status === 'generating' && (
                  <button onClick={() => router.push(`/generate/${id}`)} className="mt-4 text-yellow-500 hover:text-yellow-400 text-sm">
                    View generation progress →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && input && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Original Input</p>
            {[
              { label: 'Series Title', value: input.series_title },
              { label: 'Genre', value: input.genre },
              { label: 'Setting & Era', value: input.setting_era },
              { label: 'Tone', value: input.tone },
              { label: 'Core Conflict', value: input.core_conflict },
              { label: 'Main Characters', value: input.main_characters },
              { label: 'Total Episodes', value: String(input.total_episodes) },
            ].map(f => (
              <div key={f.label} className="grid grid-cols-[160px,1fr] gap-4 py-2 border-b border-zinc-800 last:border-0">
                <p className="text-xs font-mono text-zinc-500">{f.label}</p>
                <p className="text-sm text-zinc-300">{f.value || '—'}</p>
              </div>
            ))}
            <div className="pt-2">
              <p className="text-xs font-mono text-zinc-500 mb-2">Episode Formula</p>
              <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-800/40 rounded-lg p-4">
                {input.episode_formula}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
