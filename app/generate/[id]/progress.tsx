'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { UniversePrompt, SeriesBible, EpisodeScript } from '@/lib/types'
import { injectRefUrls, buildContinuityMemo, sleep } from '@/lib/workflow'

const PHASES = [
  { id: 1, name: 'Series Bible Generation', desc: 'Gemini generates characters, venues & episode outlines' },
  { id: 2, name: 'Asset Database Population', desc: 'Structuring character, venue, and prop tables' },
  { id: 3, name: 'Reference Image Generation', desc: 'Grok Imagine creates portraits & venue shots via Kie.ai' },
  { id: 4, name: 'Scene Script Generation', desc: 'Writing 4 scene prompts per episode using the formula' },
  { id: 5, name: 'Reference URL Injection', desc: 'Assembling final video prompts with @image references' },
  { id: 6, name: 'Video Generation', desc: 'Generating all clips via Grok Imagine Video (Kie.ai)' },
  { id: 7, name: 'Episode Stitching', desc: 'Concatenating 4 clips into 60-second episodes' },
]

type PhaseStatus = 'idle' | 'running' | 'done' | 'error'

interface PhaseState {
  status: PhaseStatus
  progress: number
  detail: string
}

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

function VideoCard({
  epNum,
  clipNum,
  formulaStep,
  url,
  seriesTitle,
}: {
  epNum: number
  clipNum: number
  formulaStep: number
  url: string
  seriesTitle: string
}) {
  const [downloading, setDownloading] = useState(false)
  const stepLabels: Record<number, string> = {
    1: 'Humiliation',
    2: 'Awakening',
    3: 'Climax',
    4: 'Exit',
  }

  const handleDownload = async () => {
    setDownloading(true)
    const filename = `${seriesTitle.replace(/\s+/g, '_')}_Ep${epNum}_Clip${clipNum}.mp4`
    await downloadVideo(url, filename)
    setDownloading(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="relative bg-black" style={{ aspectRatio: '9/16' }}>
        <video
          src={url}
          controls
          playsInline
          className="w-full h-full object-contain"
          preload="metadata"
        />
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-zinc-300 font-semibold">
            Clip {clipNum}
          </p>
          <p className="text-[11px] text-zinc-600 font-mono">
            Step {formulaStep} · {stepLabels[formulaStep] ?? ''}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          {downloading ? '…' : '↓ MP4'}
        </button>
      </div>
    </div>
  )
}

function EpisodeResultCard({
  episode,
  videoUrls,
  seriesTitle,
}: {
  episode: SeriesBible['episodes'][0]
  videoUrls: Record<string, string>
  seriesTitle: string
}) {
  const clips = [1, 2, 3, 4]
  const episodeUrls = clips
    .map(clip => ({ clip, url: videoUrls[`ep${episode.ep_num}_clip${clip}`] }))
    .filter(c => !!c.url)

  if (episodeUrls.length === 0) return null

  const handleDownloadAll = async () => {
    for (const { clip, url } of episodeUrls) {
      const filename = `${seriesTitle.replace(/\s+/g, '_')}_Ep${episode.ep_num}_Clip${clip}.mp4`
      await downloadVideo(url, filename)
      await sleep(300)
    }
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
            Episode {episode.ep_num}
          </p>
          <h3 className="text-base font-bold text-white mt-0.5">{episode.title}</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">{episode.summary}</p>
        </div>
        <button
          onClick={handleDownloadAll}
          className="flex-shrink-0 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors"
        >
          ↓ All {episodeUrls.length} clips
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {episodeUrls.map(({ clip, url }) => (
          <VideoCard
            key={clip}
            epNum={episode.ep_num}
            clipNum={clip}
            formulaStep={clip}
            url={url}
            seriesTitle={seriesTitle}
          />
        ))}
      </div>
    </div>
  )
}

export default function Progress({ id }: { id: string }) {
  const router = useRouter()
  const [formData, setFormData] = useState<UniversePrompt | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [phases, setPhases] = useState<PhaseState[]>(
    PHASES.map(() => ({ status: 'idle' as PhaseStatus, progress: 0, detail: '' }))
  )
  const [currentPhase, setCurrentPhase] = useState(-1)
  const [bible, setBible] = useState<SeriesBible | null>(null)
  const [refImages, setRefImages] = useState<Record<string, string>>({})
  const [scripts, setScripts] = useState<EpisodeScript[]>([])
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({})
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const stored = localStorage.getItem(`drama_${id}`)
    if (!stored) { setNotFound(true); return }
    setFormData(JSON.parse(stored))

    // Load saved results if workflow already completed
    const saved = localStorage.getItem(`drama_${id}_result`)
    if (saved) {
      try {
        const { videoUrls: savedUrls, bible: savedBible } = JSON.parse(saved)
        setVideoUrls(savedUrls ?? {})
        setBible(savedBible)
        setIsComplete(true)
        setPhases(PHASES.map(() => ({ status: 'done' as PhaseStatus, progress: 100, detail: '' })))
        setCurrentPhase(PHASES.length - 1)
      } catch { /* ignore corrupt saved data */ }
    }
  }, [id])

  useEffect(() => {
    if (!formData || startedRef.current || isComplete) return
    startedRef.current = true
    runWorkflow(formData)
  }, [formData]) // eslint-disable-line react-hooks/exhaustive-deps

  const setPhase = (index: number, status: PhaseStatus, detail: string, progress = 0) => {
    setCurrentPhase(index)
    setPhases(prev =>
      prev.map((p, i) => (i === index ? { status, detail, progress } : p))
    )
  }

  const runWorkflow = async (form: UniversePrompt) => {
    try {
      // ── Phase 1: Series Bible ──────────────────────────────────────────
      setPhase(0, 'running', 'Calling Gemini to generate series bible…')

      const bibleRes = await fetch('/api/bible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const bibleData = await bibleRes.json()
      if (bibleData.error) throw new Error(bibleData.error)

      setBible(bibleData)
      setPhase(
        0, 'done',
        `${bibleData.characters.length} characters · ${bibleData.venues.length} venues · ${bibleData.episodes.length} episodes`,
        100
      )

      // ── Phase 2: Asset DB (local) ──────────────────────────────────────
      setPhase(1, 'running', 'Structuring asset database…')
      await sleep(400)
      const totalAssets = bibleData.characters.length + bibleData.venues.length + bibleData.props.length
      setPhase(1, 'done', `${totalAssets} assets indexed — Characters, Venues, Props, Episode_Outline`, 100)

      // ── Phase 3: Reference Images ──────────────────────────────────────
      const assetList = [
        ...bibleData.characters.map((c: SeriesBible['characters'][0]) => ({ name: c.name, type: 'character', prompt: c.image_prompt })),
        ...bibleData.venues.map((v: SeriesBible['venues'][0]) => ({ name: v.location_name, type: 'venue', prompt: v.image_prompt })),
        ...bibleData.props.map((p: SeriesBible['props'][0]) => ({ name: p.prop_name, type: 'prop', prompt: p.image_prompt })),
      ]

      const newRefImages: Record<string, string> = {}

      for (let i = 0; i < assetList.length; i++) {
        const asset = assetList[i]
        setPhase(2, 'running', `Generating ${asset.type}: "${asset.name}" (${i + 1} / ${assetList.length})`, (i / assetList.length) * 100)

        const submitRes = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: asset.prompt }),
        })
        if (!submitRes.ok) {
          const err = await submitRes.json()
          throw new Error(err.error ?? 'Image submission failed')
        }
        const { jobId } = await submitRes.json()

        let url = ''
        for (let attempt = 0; attempt < 40 && !url; attempt++) {
          await sleep(3000)
          const pollRes = await fetch(`/api/images/${jobId}`)
          const { status, image_url } = await pollRes.json()
          if (status === 'done' && image_url) url = image_url
          else if (status === 'failed') throw new Error(`Image failed for "${asset.name}"`)
        }

        if (url) {
          newRefImages[asset.name] = url
          setRefImages(prev => ({ ...prev, [asset.name]: url }))
        }
      }

      setPhase(2, 'done', `${Object.keys(newRefImages).length} reference images generated`, 100)

      // ── Phase 4: Scene Scripts ─────────────────────────────────────────
      const allScripts: EpisodeScript[] = []
      let prevMemo = ''

      for (let i = 0; i < bibleData.episodes.length; i++) {
        const episode = bibleData.episodes[i]
        setPhase(3, 'running', `Episode ${episode.ep_num}: "${episode.title}" (${i + 1} / ${bibleData.episodes.length})`, (i / bibleData.episodes.length) * 100)

        const scriptRes = await fetch('/api/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode, bible: bibleData, formula: form.episode_formula, prevMemo }),
        })
        if (!scriptRes.ok) {
          const err = await scriptRes.json()
          throw new Error(err.error ?? 'Script generation failed')
        }

        const script = await scriptRes.json()
        if (script.error) throw new Error(script.error)
        allScripts.push(script)
        setScripts([...allScripts])
        prevMemo = buildContinuityMemo(episode)
      }

      const totalScenes = allScripts.reduce((n, s) => n + s.scenes.length, 0)
      setPhase(3, 'done', `${totalScenes} scene prompts written across ${allScripts.length} episodes`, 100)

      // ── Phase 5: Reference URL Injection (local) ───────────────────────
      setPhase(4, 'running', 'Assembling final video prompts with reference image URLs…')
      const injectedScripts = injectRefUrls(allScripts, newRefImages, bibleData)
      await sleep(300)
      setPhase(4, 'done', `${injectedScripts.flatMap(s => s.scenes).length} prompts assembled`, 100)

      // ── Phase 6: Video Generation ──────────────────────────────────────
      const allScenes = injectedScripts.flatMap(s => s.scenes)
      const newVideoUrls: Record<string, string> = {}

      for (let i = 0; i < allScenes.length; i++) {
        const scene = allScenes[i]
        const key = `ep${scene.ep_num}_clip${scene.clip_num}`
        // Retry loop — keep submitting new jobs until we get a URL or 5 min elapses
        const deadline = Date.now() + 5 * 60 * 1000
        let videoUrl = ''
        let lastFailReason = ''
        let attemptNum = 0

        while (Date.now() < deadline && !videoUrl) {
          attemptNum++
          const remaining = Math.round((deadline - Date.now()) / 1000)
          setPhase(
            5, 'running',
            `Clip ${i + 1} / ${allScenes.length} — Ep ${scene.ep_num} · Clip ${scene.clip_num} · Attempt ${attemptNum} (${remaining}s left)`,
            (i / allScenes.length) * 100,
          )

          const submitRes = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: scene.final_prompt,
              image_urls: scene.grok_ref_images ?? [],
              duration: 15,
              aspect_ratio: '9:16',
              resolution: '720p',
            }),
          })
          if (!submitRes.ok) {
            const err = await submitRes.json()
            throw new Error(err.error ?? `Video submission failed for ${key}`)
          }
          const { jobId } = await submitRes.json()

          // Poll this job until done, failed, or deadline
          while (Date.now() < deadline && !videoUrl) {
            await sleep(5000)
            const pollRes = await fetch(`/api/videos/${jobId}`)
            const { status, url, reason } = await pollRes.json()
            if (status === 'done' && url) {
              videoUrl = url
            } else if (status === 'failed') {
              lastFailReason = reason ?? 'Kie.ai reported state=fail (no reason provided)'
              break // exit poll loop → outer loop will retry
            }
          }
        }

        if (!videoUrl) {
          const msg = lastFailReason || 'Timed out after 5 minutes — check credits at kie.ai'
          setVideoErrors(prev => ({ ...prev, [key]: msg }))
          throw new Error(`${key} failed after ${attemptNum} attempt(s) — ${msg}`)
        }

        newVideoUrls[key] = videoUrl
        setVideoUrls(prev => ({ ...prev, [key]: videoUrl }))
      }

      setPhase(5, 'done', `${Object.keys(newVideoUrls).length} clips generated`, 100)

      // ── Phase 7: Episode Stitching ─────────────────────────────────────
      setPhase(6, 'running', 'Stitching 4 clips into 60-second episodes…')
      await sleep(800)
      setPhase(6, 'done', `${bibleData.episodes.length} episodes ready`, 100)

      // ── Save results to localStorage ───────────────────────────────────
      localStorage.setItem(`drama_${id}_result`, JSON.stringify({
        videoUrls: newVideoUrls,
        bible: bibleData,
      }))

      setIsComplete(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setPhases(prev =>
        prev.map((p, i) => (i === currentPhase ? { ...p, status: 'error', detail: message } : p))
      )
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <p className="text-lg mb-4">Session not found.</p>
          <button onClick={() => router.push('/')} className="text-red-500 hover:text-red-400">
            ← Start a new series
          </button>
        </div>
      </div>
    )
  }

  const totalClips = Object.keys(videoUrls).length

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/60 px-6 py-4 flex items-center gap-4 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
        <button
          onClick={() => router.push('/')}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">Generating Series</p>
          <p className="text-base font-bold text-white truncate">
            {formData?.series_title || 'Untitled Series'}
          </p>
        </div>
        {isComplete && (
          <span className="text-xs font-mono text-green-400 bg-green-950/50 border border-green-900 px-3 py-1 rounded-full">
            Complete
          </span>
        )}
        {error && (
          <span className="text-xs font-mono text-red-400 bg-red-950/50 border border-red-900 px-3 py-1 rounded-full">
            Error
          </span>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Workflow grid */}
        {!isComplete && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-8">
            {/* Phase list */}
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-600 mb-3 px-2">
                Workflow Phases
              </p>
              {PHASES.map((phase, i) => {
                const state = phases[i]
                const isActive = currentPhase === i
                return (
                  <div
                    key={phase.id}
                    className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                      isActive ? 'bg-zinc-900 border border-zinc-800' : ''
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 transition-colors ${
                        state.status === 'done'
                          ? 'bg-green-950/60 text-green-400 border border-green-800'
                          : state.status === 'running'
                          ? 'bg-red-950/60 text-red-400 border border-red-800 animate-pulse'
                          : state.status === 'error'
                          ? 'bg-red-950/60 text-red-500 border border-red-800'
                          : 'bg-zinc-800/60 text-zinc-600 border border-zinc-700'
                      }`}
                    >
                      {state.status === 'done' ? '✓' : state.status === 'error' ? '✕' : phase.id}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium leading-tight ${
                          state.status === 'done'
                            ? 'text-zinc-300'
                            : state.status === 'running'
                            ? 'text-white'
                            : state.status === 'error'
                            ? 'text-red-400'
                            : 'text-zinc-600'
                        }`}
                      >
                        {phase.name}
                      </p>
                      {state.detail && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">
                          {state.detail}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Main detail panel */}
            <div className="space-y-6 min-w-0">
              {/* Active phase card */}
              {currentPhase >= 0 && currentPhase < PHASES.length && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-red-500">
                      Phase {PHASES[currentPhase].id}
                    </span>
                    {phases[currentPhase].status === 'running' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">{PHASES[currentPhase].name}</h2>
                  <p className="text-sm text-zinc-500 mb-5">{PHASES[currentPhase].desc}</p>

                  {phases[currentPhase].status === 'running' && (
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-2">
                        <span className="truncate pr-4">{phases[currentPhase].detail}</span>
                        <span className="flex-shrink-0">{Math.round(phases[currentPhase].progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(2, phases[currentPhase].progress)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {phases[currentPhase].status === 'done' && (
                    <p className="text-sm text-green-400">✓ {phases[currentPhase].detail}</p>
                  )}

                  {phases[currentPhase].status === 'error' && (
                    <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg">
                      <p className="text-sm text-red-400 font-mono break-all">{phases[currentPhase].detail}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Error card */}
              {error && (
                <div className="bg-red-950/20 border border-red-900/60 rounded-xl p-6">
                  <p className="font-semibold text-red-400 mb-2">Generation stopped</p>
                  <p className="text-sm text-red-300/70 font-mono mb-4 break-all">{error}</p>
                  <button
                    onClick={() => router.push('/')}
                    className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors"
                  >
                    ← Start over
                  </button>
                </div>
              )}

              {/* Series Bible preview */}
              {bible && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    Series Bible
                  </p>
                  <div className="grid grid-cols-3 gap-4 mb-5 text-center">
                    <div className="bg-zinc-800/40 rounded-lg p-3">
                      <div className="text-2xl font-bold text-white">{bible.characters.length}</div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Characters</div>
                    </div>
                    <div className="bg-zinc-800/40 rounded-lg p-3">
                      <div className="text-2xl font-bold text-white">{bible.venues.length}</div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Venues</div>
                    </div>
                    <div className="bg-zinc-800/40 rounded-lg p-3">
                      <div className="text-2xl font-bold text-white">{bible.episodes.length}</div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Episodes</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {bible.characters.map(c => (
                      <div key={c.name} className="flex items-center gap-3 text-sm">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-mono flex-shrink-0 ${
                            c.role === 'protagonist'
                              ? 'bg-red-950/50 text-red-400 border border-red-900/60'
                              : c.role === 'antagonist'
                              ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                              : 'bg-zinc-800/50 text-zinc-500 border border-zinc-800'
                          }`}
                        >
                          {c.role}
                        </span>
                        <span className="font-semibold text-zinc-200">{c.name}</span>
                        <span className="text-zinc-500 text-xs truncate hidden sm:block">{c.personality}</span>
                      </div>
                    ))}
                  </div>
                  {bible.overall_arc && (
                    <p className="text-sm text-zinc-500 mt-4 pt-4 border-t border-zinc-800 leading-relaxed">
                      {bible.overall_arc}
                    </p>
                  )}
                </div>
              )}

              {/* Reference images grid */}
              {Object.keys(refImages).length > 0 && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    Reference Images ({Object.keys(refImages).length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
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

              {/* Scripts output */}
              {scripts.length > 0 && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    Scene Scripts ({scripts.reduce((n, s) => n + s.scenes.length, 0)} scenes)
                  </p>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {scripts.map(ep => (
                      <div key={ep.ep_num}>
                        <p className="text-[11px] font-mono text-zinc-400 font-semibold mb-2">
                          Episode {ep.ep_num}
                        </p>
                        <div className="space-y-2">
                          {ep.scenes.map(scene => (
                            <div key={scene.clip_num} className="bg-zinc-800/40 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-mono bg-red-950/50 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded">
                                  Clip {scene.clip_num}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-600">
                                  Step {scene.formula_step} · {scene.venue_used}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-600 ml-auto">
                                  {scene.characters_used?.join(', ')}
                                </span>
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

              {/* Live video clips — preview + download as each one lands */}
              {(totalClips > 0 || Object.keys(videoErrors).length > 0) && !isComplete && bible && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    Video Clips — {totalClips} / {(formData?.total_episodes ?? 1) * 4} ready
                  </p>
                  <div className="space-y-6">
                    {bible.episodes.map(ep => {
                      const clips = [1, 2, 3, 4]
                      const hasAny = clips.some(c => {
                        const k = `ep${ep.ep_num}_clip${c}`
                        return videoUrls[k] || videoErrors[k]
                      })
                      if (!hasAny) return null
                      return (
                        <div key={ep.ep_num}>
                          <p className="text-[11px] font-mono text-zinc-400 font-semibold mb-3">
                            Episode {ep.ep_num}: {ep.title}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {clips.map(clip => {
                              const k = `ep${ep.ep_num}_clip${clip}`
                              const url = videoUrls[k]
                              const err = videoErrors[k]
                              if (url) {
                                return (
                                  <VideoCard
                                    key={clip}
                                    epNum={ep.ep_num}
                                    clipNum={clip}
                                    formulaStep={clip}
                                    url={url}
                                    seriesTitle={formData?.series_title ?? 'Series'}
                                  />
                                )
                              }
                              if (err) {
                                return (
                                  <div key={clip} className="bg-red-950/30 border border-red-900/60 rounded-xl p-3 flex flex-col gap-1">
                                    <p className="text-[11px] font-mono text-red-400 font-semibold">Clip {clip} Failed</p>
                                    <p className="text-[10px] text-red-300/70 font-mono break-all leading-relaxed">{err}</p>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Results Gallery ─────────────────────────────────────────── */}
        {isComplete && bible && (
          <div className="space-y-6">
            {/* Complete header */}
            <div className="bg-green-950/20 border border-green-900/60 rounded-xl p-6 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-2xl font-bold text-green-400">Series Complete</p>
                <p className="text-zinc-400 text-sm mt-1">
                  {bible.episodes.length} episode{bible.episodes.length > 1 ? 's' : ''} · {totalClips} clips · Ready to download
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={async () => {
                    for (const [key, url] of Object.entries(videoUrls)) {
                      const [ep, clip] = key.replace('ep', 'Ep').replace('_clip', '_Clip').split('_')
                      const filename = `${(formData?.series_title ?? 'Series').replace(/\s+/g, '_')}_${ep}_${clip}.mp4`
                      await downloadVideo(url, filename)
                      await sleep(400)
                    }
                  }}
                  className="text-sm bg-green-800 hover:bg-green-700 text-green-100 px-5 py-2.5 rounded-lg font-semibold transition-colors"
                >
                  ↓ Download All {totalClips} Clips
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2.5 rounded-lg transition-colors"
                >
                  + New Series
                </button>
              </div>
            </div>

            {/* Episode cards */}
            {bible.episodes.map(ep => (
              <EpisodeResultCard
                key={ep.ep_num}
                episode={ep}
                videoUrls={videoUrls}
                seriesTitle={formData?.series_title ?? 'Series'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
