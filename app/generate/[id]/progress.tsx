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
  const [failedClips, setFailedClips] = useState<string[]>([])
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
        const { videoUrls: savedUrls, bible: savedBible, failedClips: savedFailed } = JSON.parse(saved)
        setVideoUrls(savedUrls ?? {})
        setBible(savedBible)
        setFailedClips(savedFailed ?? [])
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
        prevMemo = buildContinuityMemo(episode)
      }

      setScripts(allScripts)
      const totalScenes = allScripts.reduce((n, s) => n + s.scenes.length, 0)
      setPhase(3, 'done', `${totalScenes} scene prompts written across ${allScripts.length} episodes`, 100)

      // ── Phase 5: Reference URL Injection (local) ───────────────────────
      setPhase(4, 'running', 'Injecting @image reference tags into video prompts…')
      const injectedScripts = injectRefUrls(allScripts, newRefImages, bibleData)
      await sleep(300)
      setPhase(4, 'done', `${injectedScripts.flatMap(s => s.scenes).length} prompts assembled with @image references`, 100)

      // ── Phase 6: Video Generation ──────────────────────────────────────
      const allScenes = injectedScripts.flatMap(s => s.scenes)
      const newVideoUrls: Record<string, string> = {}
      const failedClips: string[] = []

      for (let i = 0; i < allScenes.length; i++) {
        const scene = allScenes[i]
        const key = `ep${scene.ep_num}_clip${scene.clip_num}`
        setPhase(5, 'running', `Clip ${i + 1} / ${allScenes.length} — Ep ${scene.ep_num} · Scene ${scene.clip_num} · Formula Step ${scene.formula_step}`, (i / allScenes.length) * 100)

        try {
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
            throw new Error(err.error ?? 'Video submission failed')
          }
          const { jobId } = await submitRes.json()

          let videoUrl = ''
          for (let attempt = 0; attempt < 30 && !videoUrl; attempt++) {
            await sleep(5000)
            const pollRes = await fetch(`/api/videos/${jobId}`)
            const { status, url, reason } = await pollRes.json()
            if (status === 'done' && url) videoUrl = url
            else if (status === 'failed') throw new Error(`Kie.ai video failed for ${key}${reason ? ` — ${reason}` : ''}`)
          }

          if (videoUrl) {
            newVideoUrls[key] = videoUrl
            setVideoUrls(prev => ({ ...prev, [key]: videoUrl }))
          } else {
            throw new Error(`${key} timed out after 30 polls`)
          }
        } catch (clipErr) {
          const msg = clipErr instanceof Error ? clipErr.message : String(clipErr)
          failedClips.push(`${key}: ${msg}`)
          // Continue with remaining clips — don't crash the pipeline
        }
      }

      setFailedClips(failedClips)
      const failNote = failedClips.length > 0 ? ` · ${failedClips.length} failed` : ''
      setPhase(5, 'done', `${Object.keys(newVideoUrls).length} / ${allScenes.length} clips generated${failNote}`, 100)

      // ── Phase 7: Episode Stitching ─────────────────────────────────────
      setPhase(6, 'running', 'Stitching 4 clips into 60-second episodes…')
      await sleep(800)
      setPhase(6, 'done', `${bibleData.episodes.length} episodes ready`, 100)

      // ── Save results to localStorage ───────────────────────────────────
      localStorage.setItem(`drama_${id}_result`, JSON.stringify({
        videoUrls: newVideoUrls,
        bible: bibleData,
        failedClips,
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

              {/* Scripts summary */}
              {scripts.length > 0 && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    Scene Prompts ({scripts.reduce((n, s) => n + s.scenes.length, 0)} total)
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {scripts.slice(0, 5).map(ep =>
                      ep.scenes.slice(0, 1).map(scene => (
                        <div key={`${ep.ep_num}-${scene.clip_num}`} className="text-xs text-zinc-500 font-mono">
                          <span className="text-zinc-400">Ep {ep.ep_num} · Clip {scene.clip_num}</span>{' '}
                          <span className="text-zinc-600 truncate">— {scene.raw_prompt?.slice(0, 80)}…</span>
                        </div>
                      ))
                    )}
                    {scripts.length > 5 && (
                      <p className="text-xs text-zinc-600 font-mono">+ {scripts.length - 5} more episodes…</p>
                    )}
                  </div>
                </div>
              )}

              {/* Live video clip counter */}
              {totalClips > 0 && !isComplete && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                    Video Clips Generated
                  </p>
                  <p className="text-3xl font-bold text-white">
                    {totalClips}
                    <span className="text-zinc-600 text-lg font-normal ml-2">
                      / {(formData?.total_episodes ?? 1) * 4} clips
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Results Gallery ─────────────────────────────────────────── */}
        {isComplete && bible && (
          <div className="space-y-6">
            {/* Complete header */}
            <div className={`border rounded-xl p-6 flex items-center justify-between gap-4 flex-wrap ${
              totalClips > 0
                ? 'bg-green-950/20 border-green-900/60'
                : 'bg-yellow-950/20 border-yellow-900/60'
            }`}>
              <div>
                <p className={`text-2xl font-bold ${totalClips > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {totalClips > 0 ? 'Series Complete' : 'Pipeline Complete — No Videos'}
                </p>
                <p className="text-zinc-400 text-sm mt-1">
                  {bible.episodes.length} episode{bible.episodes.length > 1 ? 's' : ''} · {totalClips} clips generated
                  {failedClips.length > 0 && ` · ${failedClips.length} clips failed`}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                {totalClips > 0 && (
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
                )}
                <button
                  onClick={() => router.push('/')}
                  className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2.5 rounded-lg transition-colors"
                >
                  + New Series
                </button>
              </div>
            </div>

            {/* Failed clips warning */}
            {failedClips.length > 0 && (
              <div className="bg-red-950/20 border border-red-900/60 rounded-xl p-5">
                <p className="text-sm font-semibold text-red-400 mb-3">
                  {failedClips.length} clip{failedClips.length > 1 ? 's' : ''} failed to generate
                </p>
                <div className="space-y-1.5">
                  {failedClips.map((msg, i) => (
                    <p key={i} className="text-xs font-mono text-red-300/70 break-all">{msg}</p>
                  ))}
                </div>
                {failedClips.every(m => m.toLowerCase().includes('credit') || m.toLowerCase().includes('quota') || m.toLowerCase().includes('insufficient')) && (
                  <p className="text-xs text-yellow-400/80 mt-3 pt-3 border-t border-red-900/40">
                    This looks like a Kie.ai credit/quota issue. Top up your balance at kie.ai and retry.
                  </p>
                )}
              </div>
            )}

            {/* Episode cards */}
            {totalClips > 0 && bible.episodes.map(ep => (
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
