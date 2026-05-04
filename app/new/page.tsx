'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertDramaEntry } from '@/lib/dramaStore'

const DEFAULT_FORMULA = `Step 1 — Extreme Humiliation (0–15s / Clip 1)
Setting: class reunion, ex's wedding, or high-society party.
Plot: Protagonist (low-status: delivery driver, janitor) is dressed shabbily and ruthlessly insulted by villains/snobs.
Goal: Build viewer rage and injustice to trigger resonance.

Step 2 — Identity Awakening (15–30s / Clip 2)
Plot: Phone rings. Mysterious butler/subordinate addresses protagonist as "Young Master" or "Dragon King", summoning them to inherit a massive fortune.
Performance: Gaze shifts from aggrieved → sharp, formidable.

Step 3 — Vengeful Climax (30–45s / Clip 3)
Plot: Doors burst open. Men in black kneel before protagonist. Villains who were shouting are now terrified, begging on knees. Ex-partner consumed by deep regret.

Step 4 — Iconic Exit (45–60s / Clip 4)
Punchline: Protagonist delivers core line, e.g.: "Back then, you ignored me; now I'm far beyond your reach."
Ending: Leaves with loyal female lead (helicopter exit). Provides virtual compensation for viewer powerlessness.`

const WORKFLOW_STEPS = ['① Bible', '② Assets', '③ Images', '④ Scripts', '⑤ Inject', '⑥ Video', '⑦ Stitch']

const inputClass =
  'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-600/60 focus:bg-zinc-800 transition-colors'
const labelClass = 'block text-xs font-medium text-zinc-400 mb-1.5'

export default function NewDrama() {
  const router = useRouter()
  const [form, setForm] = useState({
    series_title: '',
    genre: '',
    setting_era: '',
    core_conflict: '',
    tone: '',
    main_characters: 'LLM to design (3–5)',
    total_episodes: 20,
    episode_length_s: 60,
    clip_length_s: 15,
    episode_formula: DEFAULT_FORMULA,
  })
  const [submitting, setSubmitting] = useState(false)

  const set = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const id = crypto.randomUUID()
    localStorage.setItem(`drama_${id}`, JSON.stringify(form))
    upsertDramaEntry({
      id,
      title: form.series_title,
      genre: form.genre,
      createdAt: new Date().toISOString(),
      status: 'generating',
      clipCount: 0,
      episodeCount: 0,
    })
    router.push(`/generate/${id}`)
  }

  const clips = form.total_episodes * 4
  const estCost = Math.round(form.total_episodes * 3.25)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Dashboard
          </button>
          <div className="w-px h-4 bg-zinc-800" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-red-700 rounded flex items-center justify-center text-white text-[11px] font-bold tracking-tight">
              DG
            </div>
            <span className="font-mono text-xs tracking-widest uppercase text-zinc-400">
              New Drama Series
            </span>
          </div>
        </div>
        <span className="font-mono text-[11px] text-zinc-600 hidden sm:block">
          Grok · Kie.ai · v2.0
        </span>
      </nav>

      <div className="max-w-4xl mx-auto px-6">
        <div className="pt-14 pb-10">
          <p className="font-mono text-xs tracking-widest uppercase text-red-500 mb-3">
            AI-Powered Production Pipeline
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-white leading-tight mb-4">
            Create Your<br />
            <span className="text-red-500">Drama Series</span>
          </h1>
          <p className="text-zinc-400 text-base max-w-lg mb-8">
            Turn a single prompt into a fully produced AI drama series — consistent characters,
            cinematic scene scripts, and stitched 60-second episodes.
          </p>
          <div className="flex items-center flex-wrap gap-0">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div className="bg-zinc-900 border border-zinc-700/60 rounded px-3 py-1.5 text-xs font-mono text-zinc-400">
                  {step}
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className="text-zinc-700 px-1 text-sm">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="pb-24 space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <p className="font-mono text-[11px] tracking-widest uppercase text-zinc-500">01 — Universe Prompt</p>
              <p className="text-sm text-zinc-600 mt-1">
                Everything downstream — characters, venues, scripts, videos — is derived from this.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Series Title *</label>
                <input value={form.series_title} onChange={set('series_title')} placeholder="The Last Name on the Will" className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>Genre *</label>
                <input value={form.genre} onChange={set('genre')} placeholder="Melodrama / Micro-drama" className={inputClass} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Setting & Era</label>
                <input value={form.setting_era} onChange={set('setting_era')} placeholder="Contemporary Malaysia, 2024" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Tone</label>
                <input value={form.tone} onChange={set('tone')} placeholder="Tense, emotional, cinematic" className={inputClass} />
              </div>
            </div>
            <div className="mb-4">
              <label className={labelClass}>Core Conflict *</label>
              <textarea value={form.core_conflict} onChange={set('core_conflict')} placeholder="A dying tycoon's hidden will tears a family apart" rows={3} className={`${inputClass} resize-none`} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Main Characters</label>
                <select value={form.main_characters} onChange={set('main_characters')} className={inputClass}>
                  <option>LLM to design (3–5)</option>
                  <option>3 characters</option>
                  <option>4 characters</option>
                  <option>5 characters</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Total Episodes</label>
                <select value={form.total_episodes} onChange={e => setForm(p => ({ ...p, total_episodes: parseInt(e.target.value) }))} className={inputClass}>
                  <option value={1}>1 episode (~$3)</option>
                  <option value={5}>5 episodes (~$16)</option>
                  <option value={10}>10 episodes (~$33)</option>
                  <option value={20}>20 episodes (~$65)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
            <div className="mb-4">
              <p className="font-mono text-[11px] tracking-widest uppercase text-zinc-500">02 — Episode Formula</p>
              <p className="text-sm text-zinc-600 mt-1">
                The structural and emotional mechanics applied to every episode.
              </p>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {['Step 1 → Clip 1 (0–15s)', 'Step 2 → Clip 2 (15–30s)', 'Step 3 → Clip 3 (30–45s)', 'Step 4 → Clip 4 (45–60s)'].map(s => (
                <span key={s} className="font-mono text-[11px] px-2 py-1 bg-zinc-800/60 border border-zinc-700 rounded text-zinc-500">{s}</span>
              ))}
            </div>
            <textarea value={form.episode_formula} onChange={set('episode_formula')} rows={14} className={`${inputClass} font-mono text-xs leading-relaxed resize-none`} />
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
            <p className="font-mono text-[11px] tracking-widest uppercase text-zinc-500 mb-5">03 — Production Settings</p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-4">
                <div className="text-3xl font-bold text-white">{form.total_episodes}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1">Episodes</div>
              </div>
              <div className="text-center bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-4">
                <div className="text-3xl font-bold text-white">{clips}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1">Video Clips</div>
              </div>
              <div className="text-center bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-4">
                <div className="text-3xl font-bold text-red-400">~${estCost}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1">Est. Cost</div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 font-mono text-center">
              4 clips × 15s per episode · 9:16 · 720p · ~{Math.round(clips * 17 / 60)}min total
            </p>
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2">
            {submitting ? <><span className="animate-spin inline-block">◌</span> Starting…</> : <>Generate Drama Series →</>}
          </button>
        </form>
      </div>
    </div>
  )
}
