import { NextRequest, NextResponse } from 'next/server'
import { callGrok } from '@/lib/xai'
import { SCRIPT_SYSTEM_PROMPT, buildScriptPrompt } from '@/lib/prompts'
import type { SeriesBible, EpisodeOutline, EpisodeScript } from '@/lib/types'

export async function POST(req: NextRequest) {
  if (!process.env.KIE_API_KEY) {
    return NextResponse.json(
      { error: 'KIE_API_KEY is not configured. Add it to your .env.local file.' },
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

    const arrayMatch = raw.match(/\[[\s\S]*\]/)
    if (!arrayMatch) {
      return NextResponse.json(
        { error: `Gemini did not return JSON. Raw response: "${raw.slice(0, 400)}"` },
        { status: 500 }
      )
    }
    let scenes
    try {
      scenes = JSON.parse(arrayMatch[0])
    } catch {
      return NextResponse.json(
        { error: `JSON parse failed for episode ${episode.ep_num}. Extracted text: "${arrayMatch[0].slice(0, 400)}"` },
        { status: 500 }
      )
    }

    const script: EpisodeScript = { ep_num: episode.ep_num, scenes }
    return NextResponse.json(script)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `scripts/route: ${message}` }, { status: 500 })
  }
}
