import { NextRequest, NextResponse } from 'next/server'
import { callGrok } from '@/lib/xai'
import { SCRIPT_SYSTEM_PROMPT, buildScriptPrompt } from '@/lib/prompts'
import type { SeriesBible, EpisodeOutline, EpisodeScript } from '@/lib/types'

export async function POST(req: NextRequest) {
  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      { error: 'XAI_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const { episode, bible, formula, prevMemo }: {
    episode: EpisodeOutline
    bible: SeriesBible
    formula: string
    prevMemo: string
  } = await req.json()

  try {
    const userPrompt = buildScriptPrompt(episode, bible, formula, prevMemo)
    const raw = await callGrok(
      [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.9, maxTokens: 8192 }
    )

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const scenes = JSON.parse(cleaned)

    const script: EpisodeScript = { ep_num: episode.ep_num, scenes }
    return NextResponse.json(script)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
