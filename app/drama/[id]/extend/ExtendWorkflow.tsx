'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDramaInput, getDramaResult, getDramaEntry, upsertDramaEntry, saveDramaResult } from '@/lib/dramaStore'
import type { DramaResult } from '@/lib/dramaStore'
import { injectRefUrls, buildContinuityMemo, sleep } from '@/lib/workflow'
import type { EpisodeOutline, EpisodeScript, SeriesBible } from '@/lib/types'

type PhaseStatus = 'idle' | 'running' | 'done' | 'error'
interface PhaseState { status: PhaseStatus; progress: number; detail: string }

const PHASES = [
  { id: 1, name: 'Extending Series Bible', desc: 'Gemini generates new episode outlines' },
  { id: 2, name: 'Scene Script Generation', desc: 'Writing 4 scene prompts per new episode' },
  { id: 3, name: 'Reference URL Injection', desc: 'Assembling final prompts with reference images' },
  { id: 4, name: 'Video Generation', desc: 'Generating new clips via Grok Imagine Video' },
  { id: 5, name: 'Saving & Merging', desc: 'Merging new episodes into your series' },
]

async function downloadVideo(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(blobUrl)
  } catch { window.open(url, '_blank') }
}

function VideoCard({ epNum, clipNum, url, seriesTitle }: { epNum: number; clipNum: number; url: string; seriesTitle: string }) {
  const [dl, setDl] = useState(false)
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="relative bg-black" style={{ aspectRatio: '9/16' }}>
        <video src={url} controls playsInline className="w-full h-full object-contain" preload="metadata" />
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <p className="text-xs font-mono text-zinc-300 font-semibold">Clip {clipNum}</p>
        <button
          onClick={async () => { setDl(true); await downloadVideo(url, `${seriesTitle.replace(/\s+/g, '_')}_Ep${epNum}_Clip${clipNum}.mp4`); setDl(false) }}
          disabled={dl}
          className="text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {dl ? '…' : '↓ MP4'}
        </button>
      </div>
    </div>
  )
}

export default function ExtendWorkflow({ id }: { id: string }) {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'working' | 'done' | 'error'>('form')
  const [numEpisodes, setNumEpisodes] = useState(5)
  const [phases, setPhases] = useState<PhaseState[]>(PHASES.map(() => ({ status: 'idle', progress: 0, detail: '' })))
  const [currentPhase, setCurrentPhase] = useState(-1)
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({})
  const [newEpisodes, setNewEpisodes] = useState<EpisodeOutline[]>([])
  const [error, setError] = useState<string | null>(null)
  const [existingBible, setExistingBible] = useState<SeriesBible | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const result = getDramaResult(id)
    if (result?.bible) setExistingBible(result.bible)
  }, [id])

  const setPhaseState = (i: number, status: PhaseStatus, detail: string, progress = 0) => {
    setCurrentPhase(i)
    setPhases(prev => prev.map((p, j) => j === i ? { status, detail, progress } : p))
  }

  const startExtend = () => {
    if (startedRef.current) return
    startedRef.current = true
    setStep('working')
    runExtend()
  }

  const runExtend = async () => {
    const input = getDramaInput(id)
    const existingResult = getDramaResult(id)
    const entry = getDramaEntry(id)

    if (!input || !existingResult) {
      setError('Could not load existing series data.')
      setStep('error')
      return
    }

    const { bible, refImages, scripts: existingScripts, videoUrls: existingVideos } = existingResult
    const existingCount = bible.episodes.length

    try {
      // Phase 1: Extend bible
      setPhaseState(0, 'running', `Generating ${numEpisodes} new episode outlines…`)

      const extendRes = await fetch('/api/extend-bible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bible, numNewEpisodes: numEpisodes }),
      })
      const extendData = await extendRes.json()
      if (extendData.error) throw new Error(extendData.error)

      const newOutlines: EpisodeOutline[] = extendData.newEpisodes
      setNewEpisodes(newOutlines)

      const extendedBible: SeriesBible = {
        ...bible,
        episodes: [...bible.episodes, ...newOutlines],
      }

      setPhaseState(0, 'done', `${newOutlines.length} new outlines (episodes ${existingCount + 1}–${existingCount + newOutlines.length})`, 100)

      // Phase 2: Scripts for new episodes
      const newScripts: EpisodeScript[] = []
      let prevMemo = bible.episodes.length > 0
        ? buildContinuityMemo(bible.episodes[bible.episodes.length - 1])
        : ''

      for (let i = 0; i < newOutlines.length; i++) {
        const ep = newOutlines[i]
        setPhaseState(1, 'running', `Episode ${ep.ep_num}: "${ep.title}" (${i + 1} / ${newOutlines.length})`, (i / newOutlines.length) * 100)

        const scriptRes = await fetch('/api/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode: ep, bible: extendedBible, formula: input.episode_formula, prevMemo }),
        })
        if (!scriptRes.ok) {
          const err = await scriptRes.json()
          throw new Error(err.error ?? 'Script generation failed')
        }
        const script = await scriptRes.json()
        if (script.error) throw new Error(script.error)
        newScripts.push(script)
        prevMemo = buildContinuityMemo(ep)
      }

      setPhaseState(1, 'done', `${newScripts.reduce((n, s) => n + s.scenes.length, 0)} scene prompts written`, 100)

      // Phase 3: Inject refs
      setPhaseState(2, 'running', 'Assembling final video prompts…')
      const injected = injectRefUrls(newScripts, refImages, extendedBible)
      await sleep(300)
      setPhaseState(2, 'done', `${injected.flatMap(s => s.scenes).length} prompts assembled`, 100)

      // Phase 4: Videos
      const allScenes = injected.flatMap(s => s.scenes)
      const newVideoUrls: Record<string, string> = {}

      for (let i = 0; i < allScenes.length; i++) {
        const scene = allScenes[i]
        const key = `ep${scene.ep_num}_clip${scene.clip_num}`
        const deadline = Date.now() + 10 * 60 * 1000
        let videoUrl = ''
        let lastFailReason = ''
        let attemptNum = 0

        while (Date.now() < deadline && !videoUrl) {
          attemptNum++
          const remaining = Math.round((deadline - Date.now()) / 1000)
          setPhaseState(4 - 1, 'running',
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

          while (Date.now() < deadline && !videoUrl) {
            await sleep(5000)
            const pollRes = await fetch(`/api/videos/${jobId}`)
            const { status, url, reason } = await pollRes.json()
            if (status === 'done' && url) {
              videoUrl = url
            } else if (status === 'failed') {
              lastFailReason = reason ?? 'Kie.ai reported state=fail (no reason provided)'
              break
            }
          }
        }

        if (!videoUrl) {
          const msg = lastFailReason || 'Timed out after 10 minutes — check credits at kie.ai'
          setVideoErrors(prev => ({ ...prev, [key]: msg }))
          throw new Error(`${key} failed after ${attemptNum} attempt(s) — ${msg}`)
        }

        newVideoUrls[key] = videoUrl
        setVideoUrls(prev => ({ ...prev, [key]: videoUrl }))
      }

      setPhaseState(3, 'done', `${Object.keys(newVideoUrls).length} new clips generated`, 100)

      // Phase 5: Merge and save
      setPhaseState(4, 'running', 'Merging new episodes into your series…')
      await sleep(400)

      const mergedResult: DramaResult = {
        bible: extendedBible,
        refImages,
        scripts: [...existingScripts, ...newScripts],
        videoUrls: { ...existingVideos, ...newVideoUrls },
      }
      saveDramaResult(id, mergedResult)

      const totalClips = Object.keys(mergedResult.videoUrls).length
      upsertDramaEntry({
        id,
        title: entry?.title ?? bible.series_title,
        genre: entry?.genre ?? bible.genre,
        createdAt: entry?.createdAt ?? new Date().toISOString(),
        status: 'complete',
        clipCount: totalClips,
        episodeCount: extendedBible.episodes.length,
      })

      setPhaseState(4, 'done', `Series now has ${extendedBible.episodes.length} episodes · ${totalClips} clips`, 100)
      setStep('done')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setPhases(prev => prev.map((p, i) => i === currentPhase ? { ...p, status: 'error', detail: message } : p))
      setStep('error')
    }
  }

  // Redirect on done
  useEffect(() => {
    if (step === 'done') {
      const t = setTimeout(() => router.push(`/drama/${id}`), 1500)
      return () => clearTimeout(t)
    }
  }, [step, id, router])

  const seriesTitle = existingBible?.series_title ?? 'your series'
  const existingEpCount = existingBible?.episodes.length ?? 0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60 px-6 py-4 flex items-center gap-4 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
        <button onClick={() => router.push(`/drama/${id}`)} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          ← Back to Series
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">Generate More Episodes</p>
          <p className="text-base font-bold text-white truncate">{seriesTitle}</p>
        </div>
        {step === 'done' && (
          <span className="text-xs font-mono text-green-400 bg-green-950/50 border border-green-900 px-3 py-1 rounded-full">Done</span>
        )}
        {step === 'error' && (
          <span className="text-xs font-mono text-red-400 bg-red-950/50 border border-red-900 px-3 py-1 rounded-full">Error</span>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Form */}
        {step === 'form' && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-8 max-w-xl mx-auto">
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Continue Story</p>
            <h2 className="text-xl font-bold text-white mb-1">{seriesTitle}</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Currently {existingEpCount} episode{existingEpCount !== 1 ? 's' : ''}. New episodes will use the same characters, venues, and visual style.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Episodes to generate</label>
              <select
                value={numEpisodes}
                onChange={e => setNumEpisodes(parseInt(e.target.value))}
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-red-600/60 transition-colors"
              >
                <option value={1}>1 episode (~$3)</option>
                <option value={5}>5 episodes (~$16)</option>
                <option value={10}>10 episodes (~$33)</option>
                <option value={20}>20 episodes (~$65)</option>
              </select>
            </div>
            <div className="bg-zinc-800/40 rounded-lg p-4 mb-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-white">{numEpisodes}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">New Episodes</div>
              </div>
              <div>
                <div className="text-xl font-bold text-white">{numEpisodes * 4}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">New Clips</div>
              </div>
              <div>
                <div className="text-xl font-bold text-red-400">~${Math.round(numEpisodes * 3.25)}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Est. Cost</div>
              </div>
            </div>
            <button
              onClick={startExtend}
              className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-3.5 rounded-xl transition-colors"
            >
              Generate {numEpisodes} More Episode{numEpisodes !== 1 ? 's' : ''} →
            </button>
          </div>
        )}

        {/* Progress */}
        {(step === 'working' || step === 'error' || step === 'done') && (
          <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
            {/* Phase list */}
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-600 mb-3 px-2">Phases</p>
              {PHASES.map((phase, i) => {
                const state = phases[i]
                return (
                  <div key={phase.id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${currentPhase === i ? 'bg-zinc-900 border border-zinc-800' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                      state.status === 'done' ? 'bg-green-950/60 text-green-400 border border-green-800'
                      : state.status === 'running' ? 'bg-red-950/60 text-red-400 border border-red-800 animate-pulse'
                      : state.status === 'error' ? 'bg-red-950/60 text-red-500 border border-red-800'
                      : 'bg-zinc-800/60 text-zinc-600 border border-zinc-700'
                    }`}>
                      {state.status === 'done' ? '✓' : state.status === 'error' ? '✕' : phase.id}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium leading-tight ${
                        state.status === 'done' ? 'text-zinc-300'
                        : state.status === 'running' ? 'text-white'
                        : state.status === 'error' ? 'text-red-400'
                        : 'text-zinc-600'
                      }`}>{phase.name}</p>
                      {state.detail && <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{state.detail}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Main panel */}
            <div className="space-y-6 min-w-0">
              {/* Active phase card */}
              {currentPhase >= 0 && currentPhase < PHASES.length && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-red-500">Phase {PHASES[currentPhase].id}</span>
                    {phases[currentPhase].status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">{PHASES[currentPhase].name}</h2>
                  <p className="text-sm text-zinc-500 mb-4">{PHASES[currentPhase].desc}</p>
                  {phases[currentPhase].status === 'running' && (
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-2">
                        <span className="truncate pr-4">{phases[currentPhase].detail}</span>
                        <span>{Math.round(phases[currentPhase].progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-600 rounded-full transition-all duration-500" style={{ width: `${Math.max(2, phases[currentPhase].progress)}%` }} />
                      </div>
                    </div>
                  )}
                  {phases[currentPhase].status === 'done' && <p className="text-sm text-green-400">✓ {phases[currentPhase].detail}</p>}
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
                  <button onClick={() => router.push(`/drama/${id}`)} className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors">
                    ← Back to Series
                  </button>
                </div>
              )}

              {/* Done card */}
              {step === 'done' && (
                <div className="bg-green-950/20 border border-green-900/60 rounded-xl p-6">
                  <p className="font-semibold text-green-400 mb-1">Episodes added successfully</p>
                  <p className="text-sm text-zinc-400">Redirecting to your series…</p>
                </div>
              )}

              {/* Live new episode clips */}
              {Object.keys(videoUrls).length > 0 && newEpisodes.length > 0 && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-4">
                    New Clips — {Object.keys(videoUrls).length} / {newEpisodes.length * 4} ready
                  </p>
                  <div className="space-y-6">
                    {newEpisodes.map(ep => {
                      const clips = [1, 2, 3, 4]
                      const hasAny = clips.some(c => {
                        const k = `ep${ep.ep_num}_clip${c}`
                        return videoUrls[k] || videoErrors[k]
                      })
                      if (!hasAny) return null
                      return (
                        <div key={ep.ep_num}>
                          <p className="text-[11px] font-mono text-zinc-400 font-semibold mb-3">Episode {ep.ep_num}: {ep.title}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {clips.map(clip => {
                              const k = `ep${ep.ep_num}_clip${clip}`
                              const url = videoUrls[k]
                              const err = videoErrors[k]
                              if (url) return <VideoCard key={clip} epNum={ep.ep_num} clipNum={clip} url={url} seriesTitle={seriesTitle} />
                              if (err) return (
                                <div key={clip} className="bg-red-950/30 border border-red-900/60 rounded-xl p-3 flex flex-col gap-1">
                                  <p className="text-[11px] font-mono text-red-400 font-semibold">Clip {clip} Failed</p>
                                  <p className="text-[10px] text-red-300/70 font-mono break-all">{err}</p>
                                </div>
                              )
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
      </div>
    </div>
  )
}
